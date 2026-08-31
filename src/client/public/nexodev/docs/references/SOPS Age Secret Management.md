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

### The three configuration domains

Every environment value on the cluster belongs to exactly one domain, and each domain owns one
durable source, one local runtime, and one cluster projection. Nothing is configuration in
general — a value is app, host, or workload-secret, and which one it is decides the command that
touches it.

| Domain   | Owns                                   | Durable source                                                                      | Local runtime                             | Cluster projection                                                |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `app`    | one deployment's runtime environment   | `engine-private/conf/<deployId>/.env.<env>[.<sub-conf>]` + `.env.<env>.oci` overlay | working-tree `./.env*` + `Config.default` | `<deployId>-<env>-env` Secret                                     |
| `host`   | the node-level operational environment | `engine-private/deploy/scopes/<scope>.env.<env>`, one file per scope, mode `0600`   | host configuration store `<root>/.env`    | `underpost-config` Secret, and one scoped projection per workload |
| `secret` | workload credentials                   | `engine-private/secrets/<namespace>/<name>.enc.yaml` (SOPS/Age)                     | host configuration store, via `host`      | one Kubernetes Secret per name                                    |
| `state`  | one container's live execution state   | none — an observation is only true of a running container                           | container state store `<root>/.state`     | in-pod `/_internal/*` endpoints                                   |

### Configuration scopes inside the host domain

A domain says _who owns_ a value. It does not say _who may see it_, and the host domain's durable
source answers to several unrelated concerns at once — the edge, machine provisioning, the package
registries, the scheduled jobs. Projecting that file to a workload handed it all of them.

`src/server/runtime/config-scope.js` answers two separate questions, and only the first by pattern.

**Ownership** — `CONFIG_OWNERSHIP` says where a key lives. A family pattern is right here: a new
`MAAS_` key is a provisioning key wherever it came from.

**Visibility** — `SCOPE_ENTITLEMENTS` says what a workload may read, and is an **exact key list**. A
pattern there would mean the next credential added to a family silently inherits that family's
audience — `GITHUB_NEW_SENSITIVE_TOKEN` becoming cron-visible because `GITHUB_` once was. The
policy is therefore readable from the table alone, with nothing inferred from naming.

Owning a key is not by itself permission to ship it to a workload. A value a workload does not
consume is not projected: `DEFAULT_SSH_KEY_PATH` named a path that exists only on a host, and
handing it to a pod made the SSH resolver prefer it over the Secret volume holding the real key.

| Scope        | Owns                                                                | Consumed by                  |
| ------------ | ------------------------------------------------------------------- | ---------------------------- |
| `runtime`    | process settings with no credential value (`NODE_ENV`, `TIME_ZONE`) | every scope                  |
| `host`       | the edge, observability, cluster mail, deployment targets           | host CLI, `underpost-config` |
| `cron`       | `VULTR_*`, `DDNS_*`                                                 | the scheduled jobs           |
| `baremetal`  | `MAAS_*`, `DB_PG_MAAS_*`, `TFTP_ROOT`, `NETMASK`, `NFS_EXPORT_PATH` | `underpost baremetal`        |
| `publishing` | `NPM_*`, `DOCKER_HUB_*`, `POSTMAN_*`                                | release and image publishing |
| `app`        | a deployment's database, sessions and integrations                  | the deployment's own runtime |

Entitled to `cron`, by name: `VULTR_API_KEY`, `VULTR_INSTANCE_ID`, `VULTR_BANDWIDTH_THRESHOLD`,
`VULTR_VPS_IP`, `VULTR_SSH_USER`, `VULTR_SSH_PORT`, `FORWARD_PROXY_API_KEY`, `FORWARD_PROXY_HOST`,
`FORWARD_PROXY_PORT`, `DEFAULT_SSH_USER`, `DEFAULT_SSH_HOST`, `DEFAULT_SSH_PORT`, `GITHUB_TOKEN`,
`GITHUB_USERNAME`, `DDNS_HOST`, `DDNS_PROVIDER`, `DDNS_API_KEY`, `DDNS_USER`, `HTTP_PLAIN_IP_URL`,
`DEFAULT_DEPLOY_HOST`. Nothing else. On the reference fleet that is **17 of 86** keys.

Classification is closed. A key no rule places is reported by key name and refused, never defaulted
into a scope:

```text
configuration source rejected: domain=host deploy=dd-cron env=production key=NEW_CREDENTIAL
reason=no ownership rule matches; declare it in CONFIG_OWNERSHIP
```

### Node Roles and Capability Boundaries

The topology defines exactly three roles — `hub`, `control`, `worker` — and there is no
`control-plane`, `edge`, `gateway`, `master` or `server` role. `src/server/network/node-capability.js`
holds what each may do, derived from the gates the platform already enforces.

| Capability                    |  hub   | control | worker |
| ----------------------------- | :----: | :-----: | :----: |
| host configuration            |  yes   |   yes   |  yes   |
| WireGuard hub                 |  yes   |   no    |   no   |
| WireGuard spoke               |   no   |   yes   |  yes   |
| HAProxy                       |  yes   |   no    |   no   |
| forward proxy                 |  yes   |   no    |   no   |
| edge routing                  |  yes   |   no    |   no   |
| Kubernetes node runtime       |   no   |   yes   |  yes   |
| Kubernetes administration     | **no** |   yes   | **no** |
| cluster Secret administration | **no** |   yes   | **no** |
| cron publication              | **no** |   yes   | **no** |
| event service                 |   no   |   yes   |   no   |
| node metrics                  |  yes   |   yes   |  yes   |

**`host` domain ≠ Kubernetes administration.** Every role carries `underpost host`, because host
configuration is node-level operational configuration. It is not permission to administer the
cluster, and neither is joining one: a worker runs the kubelet and holds `kubelet.conf`, which is
node runtime, not `/etc/kubernetes/admin.conf`.

- `hub` — Kubernetes administration: **no**. It is a VPS outside the cluster, and not a Kubernetes
  node at all. HAProxy and the forward proxy are hub-only and refuse to configure themselves
  elsewhere; TLS is never terminated there.
- `control` — Kubernetes administration: **yes, only where required**. It alone initializes the
  control plane, publishes CronJobs, administers cluster Secrets and runs the event dispatcher.
- `worker` — Kubernetes administration: **no**. It joins and runs workloads; it never publishes
  CronJobs, owns the dispatcher, or writes cluster Secrets.

`assertRoleCapability` refuses an operation a role does not hold, naming the operation, the
capability and what the role does hold — and fails closed on a role the table does not define.

Node bring-up performs no cluster Secret administration. Secret projection is part of the control
node's reconciliation (`cron --setup-start --apply`), never part of a node joining the cluster.

The identities stay separate: a WireGuard peer identity, the `managementHost` SSH identity in
`conf.users.json`, a Kubernetes credential and an Underpost role are four different things, and
remediation resolves its credentials from the management-host registry rather than from ambient
defaults.

### Cron environment delivery

The CronJob pods receive their environment **injected**, never from a file:

- the `underpost-cron-env` Secret is built from the `cron` scope of the host source, so its key set
  is derived rather than hand-listed and cannot drift from the ownership table;
- `NODE_ENV` is rendered into the manifest as a container `env` entry, which wins over `envFrom`, so
  the environment the manifest resolved is the environment the pod runs;
- the shared mirror at `/opt/engine` carries **no `.env.*` at any environment**. It keeps
  `conf.*.json`, which hold `env:` references rather than values.

The pod body is therefore `node bin cron …` alone. `app load` is not run there: it materializes a
deployment's environment from that deployment's env file, and a workload has neither the file nor a
reason to write one into a tree every `container_t` process on the node can read.

### Migration — complete

`underpost host setup` splits, verifies, then retires, in that order:

1. `split` writes `engine-private/deploy/scopes/<scope>.env.<env>` at mode `0600`, refusing any key
   no scope claims rather than parking it somewhere convenient;
2. `verifySplit` proves every key of the unsplit source is present, once, under its owner, with an
   equal value;
3. `retireLegacySource` removes the unsplit file **only** when step 2 is clean. A split that dropped
   or altered a key leaves the original in place.

Each step is idempotent, and `host read` prefers the scoped sources whenever they exist. On the
reference fleet the migration has run: `engine-private/conf/dd-cron/.env.production` is retired and
there is **one durable source per scope**, with no dual-source model remaining. `host publish`
writes back through the same scope table, so no command can recreate the unsplit file.

The **OCI override** is an app-domain concern and only an app-domain concern: `.env.<env>.oci`
overlays the deployment source when the consumer is a container image rather than this host, so
`app apply` — whose Secret is read only by pods — applies it unconditionally, while `app load` on
a workstation does not.

An **instance** is a deployment too. `--args instance-id=<id>` moves the app domain onto that
instance's own `engine-private/conf/<deployId>/instances/<id>/env/<env>.env` and its own
`<deployId>-<instanceId>-<env>-env` Secret, so an instance's runtime environment is managed
through the same four verbs rather than by editing the private conf tree by hand.

The `secret` domain has no store of its own by design. A decrypted credential is node-local
configuration, so `secret load` lands it in the host domain's store rather than in a fifth
place that would then have to be kept in sync.

Two stores exist on a node and never share a file: the host configuration store (`<root>/.env`,
owned by the `host` domain) and the container state store (`<root>/.state`, owned by the
`state` domain). Different owners, different lifetimes — host configuration is provisioned
onto a node and survives, container status resets with the container. Key-level access follows
that ownership: `underpost host get|set|delete|list` for the first, `underpost state …` for the
second. There is no third command over either file.

#### The `state` domain

`state` is the runtime monitoring / telemetry layer: an agent that observes a workload's live
container execution state, health indicators and performance metrics, and exports them
off-cluster. Its base module is `src/server/runtime/runtime-status.js`, which defines the
observation contract and serves it in-pod on `/_internal/status`, `/_internal/ready`,
`/_internal/health` and `/_internal/telemetry`.

It is the one domain with no durable source, and the canonical verbs bend to that rather than
pretending otherwise:

| action    | for the state domain                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `setup`   | provisions the container state store, then takes a first observation                     |
| `load`    | collects from the **live workload** — over the monitor's own exec transport — not a file |
| `publish` | **exports the observation off-cluster** rather than writing a source back                |
| `apply`   | stamps a contract phase into the live runtime (`--args phase=running-deployment`)        |
| `status`  | the observation, plus where this agent read it from                                      |
| `rotate`  | drops a latched status and re-stamps from a fresh observation                            |
| `clean`   | removes the container state store                                                        |

`publish` is how a deployment reports itself to CI. Under GitHub Actions the observation becomes
`::notice::` / `::error::` workflow commands on stdout — the only transport that survives the SSH
hop a remote deploy runs over — plus `$GITHUB_OUTPUT` and `$GITHUB_STEP_SUMMARY` when the job is
running on the runner itself. Anywhere else it is JSON on stdout. The far side is marked by
`RUN_QUIET_CI`, which the CD workflows export explicitly because `GITHUB_ACTIONS` is
runner-local and does not travel over SSH:

```yaml
# .github/workflows/cyberia-server.cd.yml
export RUN_QUIET_CI=github
bash /home/dd/engine/deploy/cyberia-server/deploy.sh
```

```bash
# deploy/cyberia-server/deploy.sh — the canonical source for that repo's deploy scripts
deploy_step "Export mmo-server runtime state" \
    sudo -n -- /bin/bash -lc \
    "cd $ENGINE_ROOT && RUN_QUIET_CI=${RUN_QUIET_CI:-} node bin state publish \
      --env production \
      --args deploy-id=dd-cyberia,instance-id=mmo-server"
```

Container status is written to this store and to no other. An in-pod lifecycle hook stamps it
with `underpost state set container-status …`, and the deploy monitor reads it back the same
way; routing it through the host configuration store instead let a value outlive the container
that produced it.

### Store layout

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

This is implemented as `UnderpostSecret.API.installTooling()` in [secrets.js](src/cli/secrets.js), which owns the `SOPS_VERSION` / `AGE_VERSION` pins — verify them against current upstream releases before a fresh host build. `UnderpostCluster.API.initHost()` calls it alongside the existing Helm/Kind installs rather than carrying a second copy, and it reuses `Underpost.baremetal.getHostArch()` instead of a second `uname` parse. Idempotent either way: an already-resolvable binary is left untouched.

```bash
# Tooling, keypair, creation rules, encrypt, and apply — idempotent, so this is also the
# tooling install on a host that has nothing else to do.
node bin secret setup

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

`UnderpostSecret.API.assertKeyFile()` fails closed on both counts — a missing key error names every candidate path it checked, including `/home/$SUDO_USER/.config/sops/age/keys.txt` when a key is found there, so the identity mismatch is diagnosable from the message alone rather than presenting as "decryption failed".

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

**Never run `sops -e -i` (or `sops -e`) on a file that already contains a `sops:` block.** Encryption is not idempotent: a second pass treats the existing metadata as ordinary content and wraps the whole document again, producing a doubly-encrypted file whose outer `mac` no longer matches the inner one. Recovering it means decrypting twice by hand, and only if you still hold the exact recipient set from both passes. `underpost secret publish` refuses a source that already carries sops metadata for this reason.

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

`UnderpostSecret.API.encrypt()` does exactly this — stage, validate the envelope, then `moveSync` — and refuses to overwrite an existing manifest without `--force`.

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

### 3.2 `UnderpostSecret` domain

`secret` is one of the three configuration domains, registered from the shared factory in [domains.js](src/cli/domains.js) so its seven actions and five flags are the same as `host`'s and `app`'s. The SOPS/Age implementation behind them is [secrets.js](src/cli/secrets.js) as `UnderpostSecret.API` — read that file for the authoritative behavior; it is not duplicated here.

Each action is one direction of travel, identically on all three domains:

| action    | direction                              |
| --------- | -------------------------------------- |
| `setup`   | onboard the domain, idempotently       |
| `load`    | durable source → local runtime         |
| `publish` | local runtime → durable source         |
| `apply`   | durable source → live cluster          |
| `status`  | read-only report                       |
| `rotate`  | replace the projection or the identity |
| `clean`   | withdraw local traces                  |

Everything a single domain once carried its own flag for — an Age recipient, a secret name list, a sub-configuration — passes through `--args` instead, so the visible surface does not grow when one domain gains a parameter.

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
| `applyStore(namespace, options)`          | Decrypts and applies every manifest for a namespace                                      |
| `applyManifest(path, namespace, options)` | Streams one manifest through `sops --decrypt` into `kubectl apply -f -` under `pipefail` |
| `applyIfPresent(name, namespace)`         | Applies from the store when present; returns `false` so callers use the origin seed path |
| `rotateRecipient(recipient, options)`     | Re-keys every manifest onto a new recipient; `pruneRecipients` revokes the old ones      |
| `purge(name, options)`                    | Deletes the live Secret and archives (or with `force`, deletes) its manifest             |
| `list()`                                  | Lists manifests and their recipients from plaintext metadata, no private key required    |
| `hasBinary(bin)`                          | Shared PATH probe behind `assertTooling` and `installTooling`                            |
| `assertTooling(bins)`                     | Fails fast with an actionable message when `sops`/`age-keygen` are missing               |
| `installTooling()`                        | Idempotent install of the pinned `sops` and `age` binaries; owns both version pins       |
| `setupStore(names, options)`              | End-to-end onboarding: tooling, keypair, creation rules, encrypt, validate, apply        |
| `statusReport(filter, options)`           | Read-only report of tooling, key, rules, stored manifests, drift, and coverage           |

`installTooling()` is the single source of truth for host provisioning — `underpost cluster --init-host` calls it rather than carrying its own copy of the download logic.

CLI surface — every domain carries the identical action set and the identical five flags:

```bash
#   actions: setup | load | publish | apply | status | rotate | clean
#   flags:   --env <env> --namespace <ns> --args <k=v,...> --dry-run --force

# ── workload cluster secrets (SOPS/Age encrypted store) ───────────────────────
node bin secret setup                                     # tooling + key + rules + encrypt + apply
node bin secret setup --args names=grafana-admin --namespace default
node bin secret setup --dry-run                           # validate, leave the cluster alone
node bin secret setup --force                             # replace stored manifests
node bin secret status                                    # every managed key, ns default
node bin secret status --args keys=mongo                  # partial match: both mongo keys
node bin secret apply                                     # store -> cluster Secrets
node bin secret load                                      # store -> local runtime env (npm run dev)
node bin secret publish --args path=./plaintext.yaml      # plaintext -> encrypted store
node bin secret rotate --args recipient=age1...           # re-key onto a new Age recipient
node bin secret rotate --args "recipient=age1...,prune=true" --force
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,token=<new>,deploy-id=dd-cyberia"
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,token=<new>,deploy-id=dd"   # whole dd.routes fleet
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd" --dry-run
node bin secret clean --args names=postgres-secret --force          # archives the manifest
node bin secret clean --args "names=postgres-secret,delete=true" --force

# ── host cluster configuration (node-level operational environment) ───────────
node bin host setup                                       # resolve, validate, load
node bin host load                                        # source -> host configuration store
node bin host load --env development
node bin host apply --env production --namespace default  # -> underpost-config Secret
node bin host status
node bin host rotate                                      # re-project the Secret
node bin host clean --force

# Key-level CRUD on the same store, on the domain that owns it. Alongside the canonical seven
# rather than inside them: those are a bulk-lifecycle verb set with no place for per-key reads
# and writes. Only a domain owning a key-value store carries them.
node bin host get DEPLOY_ID
node bin host set GITHUB_USERNAME underpostnet
node bin host list --filter ssh

# ── app environment, and its OCI override (one deployment's runtime config) ───
node bin app setup --env development
node bin app load --env development
node bin app load --env development --args sub-conf=nexodev-dev-api
node bin app apply --env production --namespace default   # -> <deployId>-<env>-env Secret
node bin app status --args deploy-id=dd-core
node bin app rotate --env production
node bin app clean --force

# ── custom instance environment (an instance is a deployment too) ─────────────
node bin app load --env development --args deploy-id=dd-cyberia,instance-id=mmo-client-forest
node bin app status --args deploy-id=dd-cyberia,instance-id=mmo-server
node bin app apply --env production --args deploy-id=dd-cyberia,instance-id=mmo-server

# ── runtime state (live execution state, health and metrics) ──────────────────
node bin state status --args deploy-id=dd-cyberia,instance-id=mmo-server
node bin state load --args deploy-id=dd-cyberia,instance-id=mmo-server   # collect from the pods
node bin state publish --args deploy-id=dd-cyberia,instance-id=mmo-server # export off-cluster
node bin state apply --args phase=running-deployment                      # stamp the live runtime
node bin state get container-status --plain                               # key-level, in-pod
node bin state rotate                                                     # clear a stale latch
node bin state clean
```

`app apply` resolves `.env.<env>.oci` over the deployment source before projecting the Secret, because that Secret is read only by pods. `app load` on a host does not — the overlay describes a container runtime, not this machine. That asymmetry is the whole of the OCI override, and it lives in the app domain alone.

An explicit setup list is isolated: `secret setup --args names=grafana-admin` validates and applies only `grafana-admin`. Unrelated manifests sealed to another host's recipient do not block that targeted operation. Omitting the list retains the full data-tier setup behavior.

### 3.3 Cluster initialization hook

Secrets must exist before the StatefulSets that mount them, so the store is applied ahead of `kubectl apply -k`. The encrypted store is **preferred, not mandatory**: `applyIfPresent` returns `false` when no encrypted manifest exists for that secret, and the branch seeds it from the origin seed path instead. A cluster not yet onboarded keeps deploying exactly as before.

```js
// src/cli/cluster.js — UnderpostCluster.API.init()
if (options.postgresql) {
  if (options.pullImage) Underpost.cluster.pullImage('postgres:latest', options);
  if (!Underpost.secret.applyIfPresent('postgres-secret', options.namespace))
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
node bin secret publish --args path=/dev/shm/underpost-secrets/postgres-secret.yaml --namespace default

# 3. Verify the encrypted manifest round-trips before retiring the seed file.
node bin secret apply --namespace default --dry-run

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
node bin secret status
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
  node bin secret apply --namespace "$ns"
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
node bin secret setup
```

`secret setup` generates a keypair when the host has none, registers that recipient in `.sops.yaml` so anything this host encrypts from here on stays readable **here**, then reports every inherited manifest it cannot open and stops before the apply:

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
node bin secret status
node bin secret setup
```

### 5.2 Re-key the store from a host that can still decrypt

Preferred when the new host should get its own identity rather than a copy of the original — the private key never leaves its origin host. Run **on the host that holds the decrypting key**, with the new host's recipient:

```bash
# On the origin host. Additive: every existing recipient keeps working.
node bin secret rotate --args recipient=age1myykjrf… --dry-run
node bin secret rotate --args recipient=age1myykjrf…
git -C engine-private add secrets && git -C engine-private commit -m "sops: add <host> recipient" && git -C engine-private push

# Back on the new host.
underpost pull engine-private/ <github-user>/engine-private
node bin secret setup
```

### 5.3 Re-onboard from the origin seed files

Last resort, and only valid when this host's origin seed files (`engine-private/postgresql-password`, `engine-private/mongodb-username`, …) carry the credentials the cluster **already runs on**. `--force` replaces the stored manifests:

```bash
node bin secret setup --force
```

Any data key with no seed file and no `--args` override is **regenerated**. The running datastore keeps authenticating against its old credential until the new one is applied to it, so `secret setup` warns per key when this happens. Pass the existing value explicitly to avoid it:

```bash
node bin secret setup --args "names=postgres-secret,password=<current-password>" --force
```

Verify the outcome either way:

```bash
node bin secret status          # decryptable=yes for every manifest, live/in-sync per secret
```

---

## Key Rotation

`secret rotate` re-wraps each manifest's data key onto a new recipient. Secret **values** are untouched, so no workload restart is needed. It must run while a private key that can still decrypt is present — rotate _before_ destroying the outgoing key, never after.

Scheduled rotation (additive — the outgoing recipient keeps working):

```bash
# 1. Generate the successor key alongside the current one.
age-keygen -o ~/.config/sops/age/keys-new.txt
NEW_RECIPIENT="$(age-keygen -y ~/.config/sops/age/keys-new.txt)"

# 2. Preview: which recipients the manifests end up sealed to, and how many change.
node bin secret rotate --args "recipient=$NEW_RECIPIENT" --dry-run

# 3. Re-key. Both keys can decrypt from here.
node bin secret rotate --args "recipient=$NEW_RECIPIENT"

# 4. Verify the new key alone can decrypt, before retiring the old one.
SOPS_AGE_KEY_FILE=~/.config/sops/age/keys-new.txt \
  sops --decrypt engine-private/secrets/default/postgres-secret.enc.yaml >/dev/null

# 5. Promote the new key and commit the re-keyed manifests.
install -m 0600 ~/.config/sops/age/keys-new.txt ~/.config/sops/age/keys.txt
shred -u ~/.config/sops/age/keys-new.txt
git -C engine-private commit -am "secrets: rotate age recipient" && git -C engine-private push
```

Compromise response — `--args prune=true` revokes every recipient not explicitly retained, so it is gated behind `--force` after you have seen the list:

```bash
# 1. Always dry-run first. This prints exactly which recipients lose access.
node bin secret rotate --args "recipient=$NEW_RECIPIENT,prune=true" --dry-run

# 2. Retain anything that must keep working — CI/CD runners are the usual casualty.
node bin secret rotate --args "recipient=$NEW_RECIPIENT,prune=true,keep=$CI_RECIPIENT" --force

# 3. Promote the new key and publish.
install -m 0600 ~/.config/sops/age/keys-new.txt ~/.config/sops/age/keys.txt
git -C engine-private commit -am "secrets: revoke compromised age recipient" && git -C engine-private push
```

### Rotating `GIT_AUTH_TOKEN`

The same verb rotates a credential **value**, selected with `--args secret=`. `GIT_AUTH_TOKEN` is
the GitHub token CI workflows and cross-repository checkouts authenticate with, so its
authoritative home is the GitHub Actions secret store rather than this one — the encrypted
manifest is an optional mirror.

```bash
# Preview: which repositories the rotation touches. Contacts nothing, prompts for nothing.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd-cyberia" --dry-run

# Rotate. Omit token= to mint one from the GitHub App, or be prompted with no echo.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,token=<new>,deploy-id=dd-cyberia"

# Mirror the new value into the encrypted store and project it into the cluster.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,token=<new>,store=true,apply=true"
```

#### Where the new token comes from

GitHub exposes no API for creating a personal access token, so you generate the PAT yourself at
`github.com/settings/tokens` and the CLI distributes it. Sources are tried in this order:

| Order | Source                  | When                                          |
| ----- | ----------------------- | --------------------------------------------- |
| 1     | `--args token=<token>`  | Always wins.                                  |
| 2     | Piped stdin             | fd 0 is a pipe or a redirected file.          |
| 3     | `$GIT_AUTH_TOKEN`       | Exported in the environment.                  |
| 4     | No-echo terminal prompt | Interactive session, nothing above available. |

Piping is what automation should use — it is the only source that keeps the token out of both the
process table and the shell history:

```bash
printf %s "$TOKEN" | node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd"
```

Stdin is read only when fd 0 is a pipe or a redirected file, decided by `fstat` rather than
`isTTY`: `< /dev/null` is not a terminal either, and reading it would strand the rotation on an
empty token instead of falling through to the next source.

> Stdin deliberately outranks `$GIT_AUTH_TOKEN`. A pipe is what you chose for this run, whereas an
> exported `GIT_AUTH_TOKEN` is very often the **outgoing** token — inside a workflow that maps
> `GIT_AUTH_TOKEN: ${{ secrets.GIT_AUTH_TOKEN }}`, taking it would re-set the value being replaced
> and report a rotation that never happened. (`$GITHUB_TOKEN` is excluded as a source entirely, for
> the same reason: it is what `gh` authenticates _with_.)

#### Rotating the whole fleet

`deploy-id=dd` is the meta id every runner reads as "all of `engine-private/deploy/dd.routes`",
resolved through the same reader the cluster deploys from — so a rotation covers exactly the fleet
that is running, and cannot drift from it by parsing the route table a second time. Each deploy
contributes its triple (private conf, production source, test source); the union is deduplicated,
so a repository two deploys share is rotated once.

```bash
# 1. See the whole target set first. dd.routes decides it; targets are probed read-only,
#    and nothing is minted, prompted for, or written.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd" --dry-run

# 2. Rotate the fleet. Mints from the App when configured, else prompts with no echo.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd"

# 3. Or a subset — `|`, `;` or whitespace, since --args splits on commas.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd-cyberia|dd-lampp"
```

```
dd.routes: dd-lampp,dd-cyberia,dd-core,dd-prototype,dd-test
   -> engine-lampp-private     engine-lampp       engine-test-lampp
      engine-cyberia-private   engine-cyberia     engine-test-cyberia
      engine-core-private      engine-core        engine-test-core
      engine-prototype-private engine-prototype   engine-test-prototype
      engine-test-private      engine-test        engine-test-test
```

A derived name that does not exist on GitHub — a deploy with no test source repo, say — is
reported and skipped, so the fan-out stays safe to run across a fleet whose deploys do not all own
the same repositories. Without a checked-out `engine-private` there is no route table, and `dd`
falls back to the single default deploy with a warning rather than silently rotating nothing.

The targets are resolved from the deploy id through the same naming `deploy/lib/host.sh` uses, so
`dd-cyberia`, `engine-cyberia`, `engine-test-cyberia` and `engine-cyberia-private` all name the
same set. Each deploy contributes:

| Target                             | Source                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| `engine-<conf-id>-private`         | The private configuration repository.                                 |
| `engine-<conf-id>`                 | The production engine source.                                         |
| `engine-test-<conf-id>`            | The test engine source.                                               |
| `engine-ghpkg-<conf-id>`           | The package mirror `.github/workflows/ghpkg.ci.yml` publishes.        |
| `metadata.repository` per instance | Every entry in `engine-private/conf/<deploy-id>/conf.instances.json`. |

An instance is a separate product with its own repository and its own workflows reading the same
token — `dd-cyberia` builds from `cyberia-server` and `cyberia-client` — so a rotation that
covered only the engine repositories would leave half the deploy on the previous credential. An
instance keeps the owner its `metadata.repository` declares, which outranks `owner=`.

Derived names that do not exist on GitHub are dropped by the reachability probe, so there is no
separate existence check: a deploy with no ghpkg mirror or no test source simply contributes
fewer targets. `owner=` overrides the GitHub owner for the derived names, and
`repos=owner/one|owner/two` adds targets — with `|`, `;` or whitespace, because `--args` splits
on commas.

`template` is the second meta id alongside `dd`. The template lineage carries no conf id, so it
resolves to its own repositories rather than through `engine-<conf-id>` naming:

```bash
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=template" --dry-run
#   pwa-microservices-template
#   pwa-microservices-template-ghpkg
#   engine
```

| Parameter    | Effect                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| `token=`     | The replacement token. Omit it to mint one, or fall back to the prompt below.          |
| `deploy-id=` | The deploy(s) to rotate: an id, a `\|`-separated list, or `dd` for all of `dd.routes`. |
| `owner=`     | GitHub owner. Falls back to `$ENGINE_SRC_REPO`'s, then `$GITHUB_USERNAME`.             |
| `repos=`     | Extra `owner/repo` targets, separated by `\|`, `;` or whitespace.                      |
| `store=true` | Mirror into the encrypted store even when no manifest exists yet.                      |
| `apply=true` | Project the updated manifest into the cluster.                                         |

Requires the GitHub CLI, authenticated as an account holding **admin** on the targets — writing
an Actions secret needs it:

```bash
gh auth login          # or: GH_TOKEN=… (the credential gh authenticates *with*, not the new token)
gh auth status
```

Behaviour worth knowing before you run it:

- **GitHub is written first, the store second.** The token is only real once GitHub holds it. A
  store that leads GitHub records a credential no workflow can use; a GitHub that leads the store
  converges on the next run. Every write is idempotent, so a partially failed rotation is
  re-runnable with the same token.
- **An unreachable target is skipped, not fatal.** A deploy does not necessarily own every
  repository its naming implies — a test source repo often does not exist — and a missing one must
  not leave the private conf repo un-rotated. Targets that resolve but fail to write are collected
  and raised at the end, after the successful ones are on record. If _nothing_ rotated, the store
  is left untouched so it keeps recording the credential GitHub is actually running on.
- **The token is never a command argument.** It is staged on tmpfs at mode 600, handed to
  `gh secret set` on stdin, and shredded afterwards — so it reaches neither the process table nor
  the command log. `$GITHUB_TOKEN` is deliberately _not_ a source for the new value: it is what
  `gh` authenticates with, which during a rotation is the outgoing token.

### Multi-recipient management

`.sops.yaml` holds one recipient per party that must be able to decrypt — each operator, plus any CI/CD or automation key. `secret rotate` without `prune=true` is purely additive, which is how a new operator is onboarded:

```bash
# Add a colleague or a CI runner. Every existing recipient keeps working.
node bin secret rotate --args recipient=age1colleague… --dry-run
node bin secret rotate --args recipient=age1colleague…
```

Removing one party is the same operation with the survivors named explicitly:

```bash
# Offboard age1leaver…: keep everyone else, revoke the rest.
node bin secret rotate --args "recipient=age1me…,keep=age1colleague…|age1ci…,prune=true" --dry-run
```

> `--args` splits its own pairs on commas, so a multi-recipient `keep=` separates with `|` (a
> semicolon or whitespace works too). A comma there would be read as the start of the next
> parameter and silently drop every recipient after the first — which, under `prune=true`, is
> exactly the revocation this guardrail exists to prevent.

> **`--args prune=true` is the sharpest edge in this document.** It revokes by omission: anything not passed as `keep=` (or supplied as `recipient=`) loses access to _every_ manifest in the store, not just the one you had in mind. The classic incident is pruning during a compromise response and taking the CI/CD deploy key with it — pipelines then fail on the next deploy, in the middle of an active incident, with no obvious link to the rotation. Three guardrails, all enforced in code:
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
node bin secret apply --namespace default
kubectl rollout restart statefulset/postgres -n default
```

---

## Emergency Purge

`secret clean --args names=<secret>` removes that secret from the live cluster and takes its manifest out of the store. `--force` is required because the deletion is cluster state. The manifest is **archived, not deleted**, so the purge stays reversible; `--args delete=true` removes it outright.

Disposition is deliberately not `--force`'s job: `--force` authorizes touching the cluster, `delete=true` authorizes losing the manifest. Folding them into one flag would make every purge permanent and leave the archive path unreachable.

```bash
# Preview: what gets deleted, whether an origin seed path still exists.
node bin secret clean --args names=postgres-secret --namespace default --dry-run --force

# Delete the live Secret; archive the manifest under engine-private/secrets/.archive/.
node bin secret clean --args names=postgres-secret --namespace default --force

# Irreversible variant — no archive copy is kept.
node bin secret clean --args names=postgres-secret,delete=true --namespace default --force
```

Removing the manifest is what re-arms the origin seed path: with no `.enc.yaml`, `applyIfPresent` returns `false` and cluster init seeds the secret from the origin seed files again (see [§3.3](#33-cluster-initialization-hook)). Whether that seed path is actually available is reported rather than assumed — if the seed files are absent, the purge warns that the secret must be re-encrypted or created manually before redeploying workloads that mount it. Purging a secret whose seed files were already deleted otherwise surfaces only at the next deploy, as a pod stuck on an unresolvable `secretKeyRef`.

Restoring from the archive:

```bash
ls engine-private/secrets/.archive/default/
mv engine-private/secrets/.archive/default/postgres-secret.2026-08-03T14-22-07-000Z.enc.yaml \
   engine-private/secrets/default/postgres-secret.enc.yaml
node bin secret apply --namespace default
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
| Secrets exist before the workloads that mount them                       | `secret apply` ahead of `kubectl apply -k` in `cluster.init()`              |
| A purge is reversible unless `delete=true` says otherwise                | `clean` passes the disposition, not `--force`, through to `purge()`         |
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
