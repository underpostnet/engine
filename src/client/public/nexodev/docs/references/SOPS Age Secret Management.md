# SOPS + Age Secret Management

Git-native encrypted Kubernetes secrets for 100% self-hosted bare-metal `kubeadm` clusters. No cloud KMS, no Vault, no external key service — encryption recipients are local Age public keys, decryption happens only on hosts holding the matching Age private key.

**Threat model:** the encrypted manifests are safe to commit to `engine-private/`. The Age private key is **never** committed, never rendered into a manifest, and never written to a shared volume. Compromise of the Git repository alone yields nothing.

---

## Table of Contents

- [Architecture](#architecture)
- [Host Prerequisites](#host-prerequisites)
- [1. Age Keypair Generation](#1-age-keypair-generation)
- [2. Secret Encryption Workflow](#2-secret-encryption-workflow)
- [3. Underpost CLI / Production Bash Workflow](#3-underpost-cli--production-bash-workflow)
- [4. Bare-Metal Disaster Recovery Protocol](#4-bare-metal-disaster-recovery-protocol)
- [5. Joining a Store Created on Another Host](#5-joining-a-store-created-on-another-host)
- [Key Rotation](#key-rotation)
- [Emergency Purge](#emergency-purge)
- [Operational Invariants](#operational-invariants)

---

## Architecture

Single source of truth per concern:

| Concern                | Location                                                | Git tracked |
| ---------------------- | ------------------------------------------------------- | ----------- |
| Encrypted manifests    | `engine-private/secrets/<namespace>/<name>.enc.yaml`    | Yes         |
| Encryption rules       | `engine-private/secrets/.sops.yaml`                     | Yes         |
| Age **public** keys    | `engine-private/secrets/.sops.yaml` (`age:` recipients) | Yes         |
| Age **private** key    | `~/.config/sops/age/keys.txt` (mode `0600`)             | **Never**   |
| Offline private backup | Encrypted USB / paper / HSM, off-cluster                | **Never**   |

`engine-private/` is a per-deploy private repository (`engine-<conf-id>-private`) — the encrypted manifests version alongside the deploy config they belong to. This supersedes the plaintext credential files `UnderpostCluster.API.init` falls back to in [cluster.js](src/cli/cluster.js) (`--from-file=password=/home/dd/engine/engine-private/postgresql-password`), which store credentials unencrypted on disk. Onboarding is per-secret: the encrypted store wins whenever a manifest exists, and the **origin seed path** — the plaintext credential file the secret was originally seeded from — remains in place until it does. See [§3.3](#33-cluster-initialization-hook).

```
engine-private/
└── secrets/
    ├── .sops.yaml                       # creation rules + recipients (public keys)
    └── default/
        ├── postgres-secret.enc.yaml
        ├── mariadb-secret.enc.yaml
        ├── mongodb-secret.enc.yaml
        └── grafana-admin.enc.yaml
```

---

## Host Prerequisites

Idempotent install of `age` and `sops`. Both ship as static binaries; no distro package on Rocky 9.

```bash
#!/usr/bin/env bash
# underpost host prerequisite: age + sops
set -euo pipefail

SOPS_VERSION="${SOPS_VERSION:-v3.10.2}"
AGE_VERSION="${AGE_VERSION:-v1.2.1}"

case "$(uname -m)" in
  x86_64)  ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if ! command -v sops >/dev/null 2>&1; then
  curl -fsSL -o /tmp/sops \
    "https://github.com/getsops/sops/releases/download/${SOPS_VERSION}/sops-${SOPS_VERSION}.linux.${ARCH}"
  sudo install -m 0755 /tmp/sops /usr/local/bin/sops
  sudo ln -sf /usr/local/bin/sops /bin/sops
  rm -f /tmp/sops
fi

if ! command -v age-keygen >/dev/null 2>&1; then
  curl -fsSL -o /tmp/age.tar.gz \
    "https://github.com/FiloSottile/age/releases/download/${AGE_VERSION}/age-${AGE_VERSION}-linux-${ARCH}.tar.gz"
  tar -xzf /tmp/age.tar.gz -C /tmp
  sudo install -m 0755 /tmp/age/age        /usr/local/bin/age
  sudo install -m 0755 /tmp/age/age-keygen  /usr/local/bin/age-keygen
  sudo ln -sf /usr/local/bin/age        /bin/age
  sudo ln -sf /usr/local/bin/age-keygen /bin/age-keygen
  rm -rf /tmp/age /tmp/age.tar.gz
fi

sops --version
age --version
```

This is implemented as `UnderpostSecret.API.sops.installTooling()` in [secrets.js](src/cli/secrets.js), which owns the `SOPS_VERSION` / `AGE_VERSION` pins — verify them against current upstream releases before a fresh host build. `UnderpostCluster.API.initHost()` calls it alongside the existing Helm/Kind installs rather than carrying a second copy, and it reuses `Underpost.baremetal.getHostArch()` instead of a second `uname` parse. Idempotent either way: an already-resolvable binary is left untouched.

```bash
# Tooling only, no cluster host initialization.
node bin secret --install-tools

# Or as part of full host provisioning.
node bin cluster --init-host
```

The standalone script above is for hosts provisioned outside the Underpost flow.

---

## 1. Age Keypair Generation

Generate on the machine that will hold the key — the control-plane node, or an operator workstation. `age-keygen` writes the private key to stdout/file and prints the public recipient to **stderr**.

```bash
# Create the SOPS-default key location with restrictive permissions first.
umask 077
mkdir -p ~/.config/sops/age

# Generate the keypair. The public key is echoed to stderr as "Public key: age1...".
age-keygen -o ~/.config/sops/age/keys.txt

# Enforce mode explicitly (idempotent; umask above already covers fresh creation).
chmod 600 ~/.config/sops/age/keys.txt
```

Recover the public key from the private key at any time (never derive the private from the public):

```bash
age-keygen -y ~/.config/sops/age/keys.txt
# age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
```

Export the recipient for the encryption commands below:

```bash
export AGE_RECIPIENT="$(age-keygen -y ~/.config/sops/age/keys.txt)"
export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
```

> Use `SOPS_AGE_KEY_FILE` (a path), **never** `SOPS_AGE_KEY` (the key material itself) — the latter exposes the private key in `/proc/<pid>/environ` and in any process listing or crash dump.

Persist the env pointer for non-interactive runs (systemd units, CronJobs, `underpost` invocations):

```bash
sudo tee /etc/profile.d/underpost-sops.sh >/dev/null <<'EOF'
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/root/.config/sops/age/keys.txt}"
EOF
sudo chmod 644 /etc/profile.d/underpost-sops.sh
```

#### Identity context: whose `~` is `~`?

`~/.config/sops/age/keys.txt` resolves differently depending on who runs the command, and this is the most common way a working setup fails on the next run:

| Run context                          | `HOME`          | Key path resolved                        |
| ------------------------------------ | --------------- | ---------------------------------------- |
| Operator shell                       | `/home/<user>`  | `/home/<user>/.config/sops/age/keys.txt` |
| `sudo underpost …` (RHEL default)    | `/root`         | `/root/.config/sops/age/keys.txt`        |
| `sudo -E underpost …`                | `/home/<user>`  | `/home/<user>/.config/sops/age/keys.txt` |
| systemd unit / CronJob (`User=root`) | `/root`         | `/root/.config/sops/age/keys.txt`        |
| Kubernetes CronJob container         | image-dependent | usually `/root`, often nonexistent       |

Generating the key as an unprivileged user and then running `cluster --postgresql` under `sudo` therefore looks for a key that is not there — and the symptom is a decrypt failure, not an obvious path problem. Two ways to make it deterministic, in order of preference:

```bash
# 1. Pin the path explicitly for every privileged run. Survives sudo's env reset.
sudo tee /etc/profile.d/underpost-sops.sh >/dev/null <<'EOF'
export SOPS_AGE_KEY_FILE=/root/.config/sops/age/keys.txt
EOF

# 2. Or keep one canonical root-owned key and grant the operator read access
#    through a group rather than copying it around.
sudo install -o root -g underpost-secrets -m 0640 \
  ~/.config/sops/age/keys.txt /root/.config/sops/age/keys.txt
```

> Mode `0640` is only acceptable when the group is a dedicated secrets group with a known membership list. `assertKeyFile()` rejects **any** group- or world-readable bit by default (it requires `0600`/`0400`), so option 2 needs the key placed where root reads it at `0600` and the operator using their own copy. Prefer option 1.

`UnderpostSecret.API.sops.assertKeyFile()` fails closed on both counts — a missing key error names every candidate path it checked, including `/home/$SUDO_USER/.config/sops/age/keys.txt` when a key is found there, so the identity mismatch is diagnosable from the message alone rather than presenting as "decryption failed".

**Back up the private key offline before encrypting anything.** A lost Age private key with no offline copy means every encrypted manifest in Git is permanently unrecoverable.

```bash
# Offline backup — encrypted removable media, then verify and unmount.
install -m 0600 ~/.config/sops/age/keys.txt /mnt/offline-backup/underpost-age-key.txt
sha256sum ~/.config/sops/age/keys.txt /mnt/offline-backup/underpost-age-key.txt
sync && sudo umount /mnt/offline-backup
```

---

## 2. Secret Encryption Workflow

### 2.1 Creation rules (`.sops.yaml`)

Committed rules make encryption reproducible — operators never pass recipients by hand, so a manifest cannot be encrypted to the wrong key.

```yaml
# engine-private/secrets/.sops.yaml
creation_rules:
  - path_regex: engine-private/secrets/.*\.enc\.yaml$
    encrypted_regex: '^(data|stringData)$'
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn
```

`encrypted_regex: '^(data|stringData)$'` encrypts only the value tree under those keys. `apiVersion`, `kind`, `metadata`, and `type` stay plaintext, so `kubectl`, `kustomize`, and code review all still work on the encrypted file. Listing two recipients means either key can decrypt — the second is the offline break-glass key.

### 2.2 Plaintext manifest

Authored in a `tmpfs` working directory, encrypted, then destroyed. Never committed.

```yaml
# /dev/shm/underpost-secrets/postgres-secret.yaml  (plaintext — transient, never committed)
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: default
  labels:
    app: postgres
    app.kubernetes.io/managed-by: underpost
type: Opaque
stringData:
  username: admin
  password: 'Zt7#qP2xL9vR4mKe'
  POSTGRES_DB: postgresdb
```

> Key contract: [manifests/postgresql/statefulset.yaml](manifests/postgresql/statefulset.yaml) consumes `secretKeyRef.key: password` for `POSTGRES_PASSWORD`; `POSTGRES_DB` and `POSTGRES_USER` come from the `postgres-config` ConfigMap. Adding `username`/`POSTGRES_DB` here is forward-compatible — moving the StatefulSet onto them is a separate, deliberate change.

### 2.3 Encrypt

```bash
mkdir -p /dev/shm/underpost-secrets && chmod 700 /dev/shm/underpost-secrets
mkdir -p engine-private/secrets/default

# Encrypt to a distinct output file (recipients resolved from .sops.yaml).
sops --config engine-private/secrets/.sops.yaml \
     --encrypt \
     /dev/shm/underpost-secrets/postgres-secret.yaml \
  > engine-private/secrets/default/postgres-secret.enc.yaml

# Destroy the plaintext immediately — tmpfs, so it never reached persistent storage.
shred -u /dev/shm/underpost-secrets/postgres-secret.yaml 2>/dev/null || \
  rm -f /dev/shm/underpost-secrets/postgres-secret.yaml
```

Explicit-recipient form, when bootstrapping before `.sops.yaml` exists:

```bash
sops --encrypt \
     --age "$AGE_RECIPIENT" \
     --encrypted-regex '^(data|stringData)$' \
     /dev/shm/underpost-secrets/postgres-secret.yaml \
  > engine-private/secrets/default/postgres-secret.enc.yaml
```

#### Choosing between redirect, edit, and `--in-place`

These three are not interchangeable, and picking the wrong one corrupts the manifest.

| Situation                             | Correct command                      | Why                                                                                         |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Plaintext file → new `.enc.yaml`      | `sops -e src.yaml > out.enc.yaml`    | The only form that lands on the store's `<name>.enc.yaml` naming convention                 |
| Change values in an existing manifest | `sops out.enc.yaml`                  | Decrypts to tmpfs under `$EDITOR`, re-encrypts on save; never writes plaintext to disk      |
| Re-key an existing manifest           | `sops updatekeys --yes out.enc.yaml` | Re-wraps the data key only; values and `lastmodified` semantics stay intact                 |
| Plaintext file, encrypt in place      | `sops -e -i src.yaml`                | Leaves the file at its original name — breaks the store convention, so rarely what you want |

Two failure modes to avoid:

**Never run `sops -e -i` (or `sops -e`) on a file that already contains a `sops:` block.** Encryption is not idempotent: a second pass treats the existing metadata as ordinary content and wraps the whole document again, producing a doubly-encrypted file whose outer `mac` no longer matches the inner one. Recovering it means decrypting twice by hand, and only if you still hold the exact recipient set from both passes. `underpost secret sops --encrypt` refuses a source that already carries sops metadata for this reason.

**The redirect form truncates its target before sops runs.** `sops -e src.yaml > out.enc.yaml` has the shell create/empty `out.enc.yaml` first; if sops then fails — wrong recipient, unreadable key, malformed input — you are left with a zero-byte file where a working manifest used to be, and `set -e` does not undo it. Stage and move instead:

```bash
# Safe redirect: nothing replaces the live manifest until sops has succeeded.
sops --config engine-private/secrets/.sops.yaml --encrypt \
     /dev/shm/underpost-secrets/postgres-secret.yaml \
  > engine-private/secrets/default/postgres-secret.enc.yaml.staged \
  && mv engine-private/secrets/default/postgres-secret.enc.yaml.staged \
        engine-private/secrets/default/postgres-secret.enc.yaml
rm -f engine-private/secrets/default/postgres-secret.enc.yaml.staged
```

`UnderpostSecret.API.sops.encrypt()` does exactly this — stage, validate the envelope, then `moveSync` — and refuses to overwrite an existing manifest without `--force`.

### 2.4 Encrypted result

```yaml
# engine-private/secrets/default/postgres-secret.enc.yaml  (safe to commit)
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: default
  labels:
    app: postgres
    app.kubernetes.io/managed-by: underpost
type: Opaque
stringData:
  username: ENC[AES256_GCM,data:qP4vXm2A,iv:9dK1oR7sT3wYzB5nC8fH2jL6pQ4uV0xE1gM7iN3kS9c=,tag:7hJ2mP9qR4tV6wX1yZ3aB==,type:str]
  password: ENC[AES256_GCM,data:Lm8xQ2vT5nR9pK4e,iv:3fB7yU1jH6sD0gW2cN8mZ4kP5qX9tA7rE1vL3oI6uY0=,tag:2cF5nQ8sW1zA4dG7jL0mB==,type:str]
  POSTGRES_DB: ENC[AES256_GCM,data:8sV2nQ5m,iv:1aC4eG7iK0mO3qS6uW9yA2dF5hJ8lN1pR4tV7xZ0bE=,tag:5kM8pS1vY4bE7hK0nQ3tW==,type:str]
sops:
  age:
    - recipient: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
      enc: |
        -----BEGIN AGE ENCRYPTED FILE-----
        YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOSBqTndTOFRIRGxZUmZZNXFy
        VE5rWFZ3NnhBcGtnZjNwTnRUVXRUZFlwZ1RvCk1qNDVaR1J3ZDNKa2QyUnFhbVJ5
        ZFdSbFpHRjBaWEJoZEdndlkyOXVabWxuTDNOdmNITXZZV2RsCi0tLSBoM0tGbVRy
        -----END AGE ENCRYPTED FILE-----
    - recipient: age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn
      enc: |
        -----BEGIN AGE ENCRYPTED FILE-----
        YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOSBwUXcyVGtMOXZSN21OY0Zq
        SDRzRDBnVzJjTjhtWjRrUDVxWDl0QTdyRTF2TDNvSTZ1WTAKY0dFdFpXNWpjbmx3
        -----END AGE ENCRYPTED FILE-----
  lastmodified: '2026-08-03T14:22:07Z'
  mac: ENC[AES256_GCM,data:6nR9pK4eLm8xQ2vT5wYzB1jH,iv:0gW2cN8mZ4kP5qX9tA7rE3fB7yU1jH6sD1vL3oI6uY0=,tag:4dG7jL0mB2cF5nQ8sW1zA==,type:str]
  encrypted_regex: ^(data|stringData)$
  version: 3.10.2
```

Verify round-trip before committing — this is the only check that proves the file is recoverable:

```bash
sops --decrypt engine-private/secrets/default/postgres-secret.enc.yaml \
  | kubectl apply --dry-run=client -f - -o name
# secret/postgres-secret
```

Commit:

```bash
git -C engine-private add secrets/.sops.yaml secrets/default/postgres-secret.enc.yaml
git -C engine-private commit -m "secrets: add sops/age postgres-secret for default namespace"
git -C engine-private push
```

---

## 3. Underpost CLI / Production Bash Workflow

### 3.1 Apply script

Decrypts on-the-fly and streams straight into `kubectl apply -f -`. Plaintext exists only in an anonymous kernel pipe — never a file, never a temp path, never a log line.

```bash
#!/usr/bin/env bash
# src/cli/scripts/sops-apply.sh
# Decrypt SOPS/Age manifests and stream them into kubectl. No plaintext touches disk.
# Validate-then-commit: every manifest must pass a server dry run before any is applied.
set -euo pipefail
IFS=$'\n\t'
umask 077

SECRETS_DIR="${SECRETS_DIR:-engine-private/secrets}"
NAMESPACE="${NAMESPACE:-default}"
KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
KUBECONFIG_PATH="${KUBECONFIG:-/etc/kubernetes/admin.conf}"
DRY_RUN="${DRY_RUN:-0}"

log()  { printf '[sops-apply] %s\n' "$*" >&2; }
fail() { printf '[sops-apply][ERROR] %s\n' "$*" >&2; exit 1; }

# Decrypted material flows through this shell; a trace would echo it into logs.
set +x

# ── Validate: tooling ────────────────────────────────────────────────────────
for bin in sops kubectl; do
  command -v "$bin" >/dev/null 2>&1 || fail "$bin not found in PATH"
done

# ── Validate: private Age key present, readable, and correctly permissioned ──
# Identity context matters here: a key generated as an unprivileged user is NOT at
# $HOME/.config when this runs under sudo, where HOME is root's. Pass SOPS_AGE_KEY_FILE
# explicitly rather than relying on whichever HOME the caller happens to have.
[[ -f "$KEY_FILE" ]] || fail "Age private key not found: $KEY_FILE (uid $(id -u), HOME=$HOME). Pass SOPS_AGE_KEY_FILE=<path>."
[[ -r "$KEY_FILE" ]] || fail "Age private key not readable by $(id -un): $KEY_FILE"
KEY_MODE="$(stat -c '%a' "$KEY_FILE")"
[[ "$KEY_MODE" == "600" || "$KEY_MODE" == "400" ]] \
  || fail "Age private key has unsafe mode $KEY_MODE (expected 600/400): chmod 600 $KEY_FILE"
grep -q 'AGE-SECRET-KEY-1' "$KEY_FILE" || fail "No AGE-SECRET-KEY-1 material in $KEY_FILE"
export SOPS_AGE_KEY_FILE="$KEY_FILE"

# ── Validate: cluster reachable and namespace exists ─────────────────────────
[[ -r "$KUBECONFIG_PATH" ]] || fail "kubeconfig not readable: $KUBECONFIG_PATH"
export KUBECONFIG="$KUBECONFIG_PATH"
kubectl version --request-timeout=10s -o yaml >/dev/null 2>&1 \
  || fail "control plane unreachable via $KUBECONFIG_PATH"
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  kubectl create namespace "$NAMESPACE" || fail "namespace $NAMESPACE is absent and could not be created"
fi

# ── Resolve targets ──────────────────────────────────────────────────────────
TARGET_DIR="$SECRETS_DIR/$NAMESPACE"
[[ -d "$TARGET_DIR" ]] || fail "secrets directory not found: $TARGET_DIR"

mapfile -t MANIFESTS < <(find "$TARGET_DIR" -maxdepth 1 -type f -name '*.enc.yaml' | sort)
(( ${#MANIFESTS[@]} > 0 )) || fail "no *.enc.yaml manifests under $TARGET_DIR"

# ── Envelope check: refuse anything that is not an encrypted Secret ──────────
# metadata/kind stay plaintext under encrypted_regex, so this needs no key. Catches a
# manifest that was never encrypted (disclosed credentials) and name/file mismatches
# that would apply cleanly while leaving secretKeyRef unresolvable.
for manifest in "${MANIFESTS[@]}"; do
  grep -q '^sops:' "$manifest" || fail "$manifest carries no sops metadata — it is not encrypted"
  grep -q 'ENC\[AES256_GCM' "$manifest" || fail "$manifest has no encrypted values"
  kind="$(grep -m1 '^kind:' "$manifest" | awk '{print $2}')"
  [[ "$kind" == "Secret" ]] || fail "$manifest is a ${kind:-<none>}, not a Secret"
  declared="$(grep -m1 -E '^[[:space:]]{2,}name:' "$manifest" | awk '{print $2}')"
  expected="$(basename "$manifest" .enc.yaml)"
  [[ "$declared" == "$expected" ]] \
    || fail "$manifest declares metadata.name '$declared' but is stored as '$expected'"
done

# ── Phase 1: dry-run every manifest before mutating anything ─────────────────
# Applying in one pass means manifest N failing to decrypt leaves 1..N-1 already live,
# i.e. a half-applied namespace. `pipefail` is load-bearing throughout: without it a sops
# failure yields an empty stream and `kubectl apply -f -` exits 0, applying nothing.
for manifest in "${MANIFESTS[@]}"; do
  sops --decrypt --output-type yaml "$manifest" \
    | kubectl apply -f - --dry-run=server -n "$NAMESPACE" >/dev/null \
    || fail "validation failed for $manifest (check the Age key matches a recipient in its sops block)"
done
log "validated ${#MANIFESTS[@]} manifest(s) against ns/$NAMESPACE"

if [[ "$DRY_RUN" == "1" ]]; then
  log "dry run requested; stopping before apply"
  exit 0
fi

# ── Phase 2: commit ──────────────────────────────────────────────────────────
applied=0
for manifest in "${MANIFESTS[@]}"; do
  log "applying $(basename "$manifest") -> ns/$NAMESPACE"
  sops --decrypt --output-type yaml "$manifest" | kubectl apply -f - -n "$NAMESPACE" \
    || fail "APPLY FAILED for $manifest after validation passed. ${applied} manifest(s) are already live; \
namespace $NAMESPACE is partially applied. Re-run once resolved — kubectl apply is idempotent."
  applied=$(( applied + 1 ))
done

log "applied $applied manifest(s) to namespace $NAMESPACE"
```

Usage:

```bash
chmod +x src/cli/scripts/sops-apply.sh

# Apply every encrypted secret for the default namespace.
sudo -E SOPS_AGE_KEY_FILE=/root/.config/sops/age/keys.txt \
  ./src/cli/scripts/sops-apply.sh

# Server-side dry run against a non-default namespace.
DRY_RUN=1 NAMESPACE=cyberia ./src/cli/scripts/sops-apply.sh
```

### 3.2 `UnderpostSecret` platform

The `secret` command dispatches on `Underpost.secret[<platform>]` ([index.js:424-451](src/cli/index.js#L424-L451)). The `sops` platform is implemented in [secrets.js](src/cli/secrets.js) as `UnderpostSecret.API.sops` — read that file for the authoritative behavior; it is not duplicated here.

| Method                                    | Purpose                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `keyFile()`                               | Resolves the Age private key path, honoring `SOPS_AGE_KEY_FILE`                          |
| `manifestPath(name, namespace)`           | Canonical store path, `<store>/<namespace>/<name>.enc.yaml`                              |
| `manifests(namespace?)`                   | Enumerates stored manifests, skipping dot-prefixed entries like `.archive`               |
| `manifestMeta(path)`                      | Reads the plaintext envelope: `kind`, name, namespace, whether it is actually encrypted  |
| `assertManifest(path, expect)`            | Fails closed on unencrypted, non-Secret, or name/namespace-mismatched manifests          |
| `keyFileCandidates()`                     | Every key path tried, so a not-found error can name them (incl. the `sudo` case)         |
| `assertKeyFile()`                         | Requires the key to exist and be unreadable by group/other before any decrypt            |
| `has(name, namespace)`                    | Whether an encrypted manifest exists for a secret                                        |
| `recipient()`                             | Derives the `age1…` public recipient from the private key                                |
| `manifestRecipients(path)`                | Recipients a manifest is sealed to, read from its plaintext metadata                     |
| `creationRecipients()`                    | Recipients configured in the `.sops.yaml` creation rule                                  |
| `writeCreationRecipients(recipients)`     | Rewrites that rule in place, collapsing any folded form to one line                      |
| `init()`                                  | Generates the keypair and `.sops.yaml`; never overwrites an existing key                 |
| `encrypt(plaintextPath, namespace)`       | Encrypts into the store and shreds the plaintext source                                  |
| `apply(namespace, options)`               | Decrypts and applies every manifest for a namespace                                      |
| `applyManifest(path, namespace, options)` | Streams one manifest through `sops --decrypt` into `kubectl apply -f -` under `pipefail` |
| `applyIfPresent(name, namespace)`         | Applies from the store when present; returns `false` so callers use the origin seed path |
| `rotate(recipient, options)`              | Re-keys every manifest onto a new recipient; `pruneRecipients` revokes the old ones      |
| `purge(name, options)`                    | Deletes the live Secret and archives (or with `force`, deletes) its manifest             |
| `list()`                                  | Lists manifests and their recipients from plaintext metadata, no private key required    |
| `hasBinary(bin)`                          | Shared PATH probe behind `assertTooling` and `installTooling`                            |
| `assertTooling(bins)`                     | Fails fast with an actionable message when `sops`/`age-keygen` are missing               |
| `installTooling()`                        | Idempotent install of the pinned `sops` and `age` binaries; owns both version pins       |
| `setup(names, options)`                   | End-to-end onboarding: tooling, keypair, creation rules, encrypt, validate, apply        |
| `status(filter, options)`                 | Read-only report of tooling, key, rules, stored manifests, drift, and coverage           |

`installTooling()` is the single source of truth for host provisioning — `underpost cluster --init-host` calls it rather than carrying its own copy of the download logic.

CLI surface:

```bash
# Install the sops and age binaries only, with no cluster host initialization.
# The platform argument is optional; it defaults to "sops".
node bin secret --install-tools

# One-time: generate the Age keypair and .sops.yaml creation rule.
node bin secret sops --init

# Encrypt a plaintext manifest authored in tmpfs (source is shredded).
node bin secret sops --encrypt /dev/shm/underpost-secrets/postgres-secret.yaml --namespace default

# Inventory (no private key needed).
node bin secret sops --list

# Decrypt + apply the whole namespace, streamed.
node bin secret sops --apply --namespace default
node bin secret sops --apply --namespace default --dry-run

# Rotate onto a new recipient (see Key Rotation).
node bin secret sops --rotate --recipient age1… --dry-run
node bin secret sops --rotate --recipient age1…

# Emergency purge (see Emergency Purge).
node bin secret sops --purge postgres-secret --namespace default --dry-run
node bin secret sops --purge postgres-secret --namespace default

# End-to-end onboarding, and the read-only report of what it produced.
# Both act on the store itself, so they resolve ahead of the platform argument.
node bin secret --setup                                   # whole data tier
node bin secret --setup mongodb-secret,mongodb-keyfile --namespace prod
node bin secret --setup postgres-secret --args "password=s3cr3t"
node bin secret --setup grafana-admin --namespace default
node bin secret --setup --dry-run                         # validate, leave the cluster alone
node bin secret --setup --force                           # replace stored manifests
node bin secret --status                                  # every managed key, ns default
node bin secret --status mongo                            # partial match: both mongo keys

# Load the underpost root env store from the cron deploy env file (dd.cron).
# This is what the kubeadm and K3s node bootstrap scripts run.
node bin secret --from-cron-env

# Publish the cron deploy environment as the underpost-config Secret (envFrom).
node bin secret --underpost-config production

# Seed secrets from a file or from the container environment, and withdraw every
# filesystem trace afterwards. --global-clean keeps the Age key: the node needs
# it to re-apply secrets on restart.
node bin secret --create-from-file ./engine-private/conf/dd-core/.env.production
node bin secret --create-from-env
node bin secret --global-clean
```

An explicit setup list is isolated: `--setup grafana-admin` validates and applies only `grafana-admin`. Unrelated manifests sealed to another host's recipient do not block that targeted operation. Omitting the list retains the full data-tier setup behavior.

### 3.3 Cluster initialization hook

Secrets must exist before the StatefulSets that mount them, so the store is applied ahead of `kubectl apply -k`. The encrypted store is **preferred, not mandatory**: `applyIfPresent` returns `false` when no encrypted manifest exists for that secret, and the branch seeds it from the origin seed path instead. A cluster not yet onboarded keeps deploying exactly as before.

```js
// src/cli/cluster.js — UnderpostCluster.API.init()
if (options.postgresql) {
  if (options.pullImage) Underpost.cluster.pullImage('postgres:latest', options);
  if (!Underpost.secret.sops.applyIfPresent('postgres-secret', options.namespace))
    shellExec(
      `sudo kubectl create secret generic postgres-secret --from-file=password=/home/dd/engine/engine-private/postgresql-password --dry-run=client -o yaml | kubectl apply -f - -n ${options.namespace}`,
    );
  shellExec(`kubectl apply -k ${underpostRoot}/manifests/postgresql -n ${options.namespace}`);
}
```

The `mariadb` and `mysql` branches follow the same shape. Onboarding is therefore per-secret and reversible — encrypting `postgres-secret.enc.yaml` switches only Postgres to the encrypted path; removing that file reverts it. Once every secret in a namespace is onboarded, the origin seed files under `engine-private/{mariadb,mysql,postgresql}-*` can be deleted.

> **The seed fallback triggers on absence only — never on corruption.** `applyIfPresent` seeds from plaintext when the manifest is _missing_. A manifest that exists but is unencrypted, malformed, or names a different Secret raises instead of falling through. That distinction is deliberate: a fail-open here would let a tampered or truncated store silently redeploy the stale credentials the operator believes they replaced, and would mask an accidentally-committed plaintext manifest rather than flagging the disclosure. `assertManifest` enforces it before any decrypt is attempted, reading only the plaintext envelope:
>
> - no `sops:` block or no `ENC[AES256_GCM` values → the file was never encrypted; refuse and treat its contents as disclosed
> - `kind` is not `Secret` → refuse
> - `metadata.name` ≠ the stored filename → refuse, because applying it would succeed while leaving `secretKeyRef: postgres-secret` permanently unresolvable
> - `metadata.namespace` ≠ the target namespace → refuse
>
> None of these checks need the private key, so they run identically on a host that cannot decrypt.

Onboarding one secret from its seed path:

```bash
# 1. Reconstruct the manifest in tmpfs from the origin seed file.
mkdir -p /dev/shm/underpost-secrets && chmod 700 /dev/shm/underpost-secrets
cat > /dev/shm/underpost-secrets/postgres-secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: default
  labels:
    app.kubernetes.io/managed-by: underpost
type: Opaque
stringData:
  password: $(cat engine-private/postgresql-password)
EOF

# 2. Encrypt into the store (the tmpfs source is shredded automatically).
node bin secret sops --encrypt /dev/shm/underpost-secrets/postgres-secret.yaml --namespace default

# 3. Verify the encrypted manifest round-trips before retiring the seed file.
node bin secret sops --apply --namespace default --dry-run

# 4. From here `cluster --postgresql` takes the encrypted path automatically.
rm -f engine-private/postgresql-password
```

---

## 4. Bare-Metal Disaster Recovery Protocol

Inputs: the Git repository and the offline Age private key. Nothing else — no cluster backup, no etcd snapshot, no external secret store.

### Step 1 — Provision the control plane and restore the Age key

```bash
# Fresh bare-metal control plane via the standard Underpost flow.
node bin cluster --init-host
node bin cluster --kubeadm --config --chown

# Restore the offline Age private key. Mode is enforced, not assumed.
umask 077
mkdir -p /root/.config/sops/age
install -m 0600 /mnt/offline-backup/underpost-age-key.txt /root/.config/sops/age/keys.txt
export SOPS_AGE_KEY_FILE=/root/.config/sops/age/keys.txt

# Verify the restored key derives the expected recipient before proceeding.
age-keygen -y "$SOPS_AGE_KEY_FILE"
```

### Step 2 — Clone the encrypted manifests from Git

```bash
node bin clone <github-user>/engine-<conf-id>-private
mv engine-<conf-id>-private /home/dd/engine/engine-private

# Confirm the recipient of the restored key matches a recipient in the manifests.
node bin secret sops --list
```

### Step 3 — Verify decryption before touching the cluster

Proves key/manifest integrity while still read-only. A failure here is a key problem, not a cluster problem.

```bash
for f in engine-private/secrets/*/*.enc.yaml; do
  sops --decrypt "$f" | kubectl apply --dry-run=client -f - -o name \
    || { echo "DECRYPT FAILED: $f" >&2; exit 1; }
done
```

### Step 4 — Restore secrets, then workloads

```bash
# Streamed decrypt+apply per namespace. Re-runnable; kubectl apply is idempotent.
for ns in $(ls engine-private/secrets); do
  node bin secret sops --apply --namespace "$ns"
done

# Bring up the data plane now that every secretKeyRef resolves.
# Any secret without a manifest is seeded from its origin seed path, if one survived.
node bin cluster --kubeadm --postgresql --mongodb --valkey --contour --cert-manager

# Confirm the pods actually consumed the restored credentials.
kubectl get secrets -A -l app.kubernetes.io/managed-by=underpost
kubectl get pods -A -o wide
```

---

## 5. Joining a Store Created on Another Host

The common production case is not disaster recovery but a second host — a new control plane, a replica, a CI runner — that pulls `engine-private/` and finds an encrypted store it had no part in creating. Its own Age key is **not** a recipient of those manifests, and no amount of re-running setup changes that: only a holder of a decrypting key can grant access.

```bash
underpost pull engine-private/ <github-user>/engine-private
node bin secret --setup
```

`secret --setup` generates a keypair when the host has none, registers that recipient in `.sops.yaml` so anything this host encrypts from here on stays readable **here**, then reports every inherited manifest it cannot open and stops before the apply:

```
N encrypted manifest(s) are sealed to Age recipients this host does not hold, so they cannot be decrypted here:
  default/mariadb-secret -> age1mq5jhnym3w2cgexypl5law8my77uvqt2pxaxdqfs8gs0eqcltseq27nquw
  this host holds: age1myykjrfvjg55hddhetqxs4kkpe9mzjd8yae87c8d2c335kghgquqsgrl8q
```

Registering the recipient does **not** re-key existing manifests — `sops updatekeys` has to decrypt each data key first. Pick one of three remedies.

### 5.1 Install the key that already opens them

The normal path for a production host joining a store it should have full access to. A key file may hold several identities, so the origin key is appended rather than replacing whatever the host generated.

```bash
umask 077
cat /mnt/offline-backup/underpost-age-key.txt >> /root/.config/sops/age/keys.txt
chmod 600 /root/.config/sops/age/keys.txt

# Every identity this host now holds; one of them must appear in --list output.
age-keygen -y /root/.config/sops/age/keys.txt
node bin secret sops --list
node bin secret --setup
```

### 5.2 Re-key the store from a host that can still decrypt

Preferred when the new host should get its own identity rather than a copy of the original — the private key never leaves its origin host. Run **on the host that holds the decrypting key**, with the new host's recipient:

```bash
# On the origin host. Additive: every existing recipient keeps working.
node bin secret sops --rotate --recipient age1myykjrf… --dry-run
node bin secret sops --rotate --recipient age1myykjrf…
git -C engine-private add secrets && git -C engine-private commit -m "sops: add <host> recipient" && git -C engine-private push

# Back on the new host.
underpost pull engine-private/ <github-user>/engine-private
node bin secret --setup
```

### 5.3 Re-onboard from the origin seed files

Last resort, and only valid when this host's origin seed files (`engine-private/postgresql-password`, `engine-private/mongodb-username`, …) carry the credentials the cluster **already runs on**. `--force` replaces the stored manifests:

```bash
node bin secret --setup --force
```

Any data key with no seed file and no `--args` override is **regenerated**. The running datastore keeps authenticating against its old credential until the new one is applied to it, so `secret --setup` warns per key when this happens. Pass the existing value explicitly to avoid it:

```bash
node bin secret --setup postgres-secret --force --args "password=<current-password>"
```

Verify the outcome either way:

```bash
node bin secret --status          # decryptable=yes for every manifest, live/in-sync per secret
```

---

## Key Rotation

`--rotate` re-wraps each manifest's data key onto a new recipient. Secret **values** are untouched, so no workload restart is needed. It must run while a private key that can still decrypt is present — rotate _before_ destroying the outgoing key, never after.

Scheduled rotation (additive — the outgoing recipient keeps working):

```bash
# 1. Generate the successor key alongside the current one.
age-keygen -o ~/.config/sops/age/keys-new.txt
NEW_RECIPIENT="$(age-keygen -y ~/.config/sops/age/keys-new.txt)"

# 2. Preview: which recipients the manifests end up sealed to, and how many change.
node bin secret sops --rotate --recipient "$NEW_RECIPIENT" --dry-run

# 3. Re-key. Both keys can decrypt from here.
node bin secret sops --rotate --recipient "$NEW_RECIPIENT"

# 4. Verify the new key alone can decrypt, before retiring the old one.
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys-new.txt \
  sops --decrypt engine-private/secrets/default/postgres-secret.enc.yaml >/dev/null

# 5. Promote the new key and commit the re-keyed manifests.
install -m 0600 ~/.config/sops/age/keys-new.txt ~/.config/sops/age/keys.txt
shred -u ~/.config/sops/age/keys-new.txt
git -C engine-private commit -am "secrets: rotate age recipient" && git -C engine-private push
```

Compromise response — `--prune-recipients` revokes every recipient not explicitly retained, so it is gated behind `--force` after you have seen the list:

```bash
# 1. Always dry-run first. This prints exactly which recipients lose access.
node bin secret sops --rotate --recipient "$NEW_RECIPIENT" --prune-recipients --dry-run

# 2. Retain anything that must keep working — CI/CD runners are the usual casualty.
node bin secret sops --rotate --recipient "$NEW_RECIPIENT" --prune-recipients \
  --keep-recipients "$CI_RECIPIENT" --force

# 3. Promote the new key and publish.
install -m 0600 ~/.config/sops/age/keys-new.txt ~/.config/sops/age/keys.txt
git -C engine-private commit -am "secrets: revoke compromised age recipient" && git -C engine-private push
```

### Multi-recipient management

`.sops.yaml` holds one recipient per party that must be able to decrypt — each operator, plus any CI/CD or automation key. `--rotate` without `--prune-recipients` is purely additive, which is how a new operator is onboarded:

```bash
# Add a colleague or a CI runner. Every existing recipient keeps working.
node bin secret sops --rotate --recipient age1colleague… --dry-run
node bin secret sops --rotate --recipient age1colleague…
```

Removing one party is the same operation with the survivors named explicitly:

```bash
# Offboard age1leaver…: keep everyone else, revoke the rest.
node bin secret sops --rotate --recipient age1me… \
  --keep-recipients "age1colleague…,age1ci…" --prune-recipients --dry-run
```

> **`--prune-recipients` is the sharpest edge in this document.** It revokes by omission: anything not passed to `--keep-recipients` (or supplied as `--recipient`) loses access to _every_ manifest in the store, not just the one you had in mind. The classic incident is pruning during a compromise response and taking the CI/CD deploy key with it — pipelines then fail on the next deploy, in the middle of an active incident, with no obvious link to the rotation. Three guardrails, all enforced in code:
>
> 1. `--dry-run` reports `revoked: [...]` and warns when the list is non-empty, without touching a file.
> 2. A prune that would drop any recipient **refuses to run** without `--force`.
> 3. After each `updatekeys`, the manifest is re-read and the new recipient must be present in its `sops:` block — `updatekeys` no-ops silently in some cases and its exit code does not distinguish that from success, so a rotation can never be reported complete while a file stays on the old key.
>
> Keep an ownership comment above the `age:` line in `.sops.yaml`. `writeCreationRecipients()` only rewrites the `age:` line and its folded continuations, so preceding comments survive rotation:
>
> ```yaml
> creation_rules:
>   - path_regex: engine-private/secrets/.*\.enc\.yaml$
>     encrypted_regex: '^(data|stringData)$'
>     # age1ql3z…mcac8p  operator: development@underpost.net
>     # age1w7yx…8zwptn  break-glass: offline safe
>     # age1ci9k…4mfp2q  automation: engine-cd runner
>     age: age1ql3z…mcac8p,age1w7yx…8zwptn,age1ci9k…4mfp2q
> ```

Rotation is also partially-applied-safe in the other direction: if verification fails on manifest N, the store is left with 1..N-1 re-keyed and the error says so. Re-running after fixing the cause is safe — `updatekeys` is idempotent per file.

Credential rotation (new password) is a different operation — it changes the value and does require a rollout:

```bash
sops engine-private/secrets/default/postgres-secret.enc.yaml   # edit in $EDITOR, re-encrypts on save
node bin secret sops --apply --namespace default
kubectl rollout restart statefulset/postgres -n default
```

---

## Emergency Purge

`--purge` removes one secret from the live cluster and takes its manifest out of the store. The manifest is **archived, not deleted**, so the purge is reversible; `--force` deletes it outright.

```bash
# Preview: what gets deleted, whether an origin seed path still exists.
node bin secret sops --purge postgres-secret --namespace default --dry-run

# Delete the live Secret; archive the manifest under engine-private/secrets/.archive/.
node bin secret sops --purge postgres-secret --namespace default

# Irreversible variant — no archive copy is kept.
node bin secret sops --purge postgres-secret --namespace default --force
```

Removing the manifest is what re-arms the origin seed path: with no `.enc.yaml`, `applyIfPresent` returns `false` and cluster init seeds the secret from the `--from-file` credentials again (see [§3.3](#33-cluster-initialization-hook)). Whether that seed path is actually available is reported rather than assumed — if the seed files are absent, the purge warns that the secret must be re-encrypted or created manually before redeploying workloads that mount it. Purging a secret whose seed files were already deleted otherwise surfaces only at the next deploy, as a pod stuck on an unresolvable `secretKeyRef`.

Restoring from the archive:

```bash
ls engine-private/secrets/.archive/default/
mv engine-private/secrets/.archive/default/postgres-secret.2026-08-03T14-22-07-000Z.enc.yaml \
   engine-private/secrets/default/postgres-secret.enc.yaml
node bin secret sops --apply --namespace default
```

`.archive` is dot-prefixed so `list()`, `apply()`, and `manifests()` never treat it as a namespace.

---

## Operational Invariants

| Invariant                                                                | Enforced by                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Plaintext secrets never reach persistent storage                         | Authoring in `/dev/shm`; `sops --decrypt \| kubectl apply -f -`             |
| A decrypt failure never applies an empty manifest                        | `set -o pipefail` around every decrypt/apply pipe                           |
| A failed encrypt never destroys the manifest it was replacing            | Staged temp file + validate + `moveSync`, never a bare `>` redirect         |
| A manifest is never double-encrypted                                     | `encrypt()` refuses a source that already carries sops metadata             |
| An unencrypted or mismatched manifest is never applied                   | `assertManifest()` envelope check, before any decrypt, needs no key         |
| The seed fallback triggers on absence only, never on corruption          | `applyIfPresent()` returns `false` only for a missing file; else it raises  |
| A namespace is never left half-applied by a mid-loop failure             | Validate-then-commit: envelope + server dry run of all, then apply          |
| The Age private key never enters Git, a manifest, or a container         | `.gitignore` on `keys.txt`; `SOPS_AGE_KEY_FILE` path-only pointer           |
| The private key is never exposed in process listings                     | `SOPS_AGE_KEY_FILE`, never `SOPS_AGE_KEY`; `disableLog` on every sops call  |
| A group/world-readable private key is never used                         | `assertKeyFile()` rejects any mode with `0o077` bits set                    |
| A key-path mismatch is diagnosable, not a mystery decrypt failure        | `keyFileCandidates()` names every path tried, including the `sudo` case     |
| A host never encrypts into a store it cannot read back                   | `init()` registers the local recipient in an inherited `.sops.yaml`         |
| A foreign-sealed manifest is named and explained, not failed inside sops | `assertDecryptable()` pre-flight before apply, rotate, and the decrypt pipe |
| A manifest cannot be encrypted to an unlisted recipient                  | Committed `.sops.yaml` `creation_rules`                                     |
| Recipients are never revoked by accident                                 | Prune refuses without `--force`; `--dry-run` lists the revoked set first    |
| A rotation is never reported complete while a file stays on the old key  | Post-`updatekeys` re-read asserts the new recipient is in the `sops:` block |
| Secrets exist before the workloads that mount them                       | `sops.apply()` ahead of `kubectl apply -k` in `cluster.init()`              |
| Re-running apply, rotate, or purge is safe                               | `kubectl apply` and `updatekeys` are idempotent; purge archives by default  |
| Losing the key is recoverable                                            | Second break-glass recipient + verified offline backup                      |

Add to `.gitignore` before the first `git add`:

```gitignore
# Age private key material — encrypted manifests are safe to commit, keys are not.
**/keys.txt
**/*.agekey
*.age.key
.sops-plaintext/
```

Post-deploy filesystem cleanup already exists as `UnderpostSecret.API.globalSecretClean()` in [secrets.js](src/cli/secrets.js) — it clears `engine-private`, `.env`, and the conf cache. It intentionally does **not** touch `~/.config/sops/age/keys.txt`: the key must survive so the node can re-apply secrets on restart. Container images must never receive it — pods consume the resulting Kubernetes Secret, never the Age key.
