# SOPS + Age Secret Management

Git-native encrypted Kubernetes secrets for 100% self-hosted bare-metal `kubeadm` clusters. No cloud KMS, no Vault, no external key service — encryption recipients are local Age public keys, decryption happens only on hosts holding the matching Age private key.

**Threat model:** the encrypted manifests are safe to commit to `engine-private/`. The Age private key is **never** committed, never rendered into a manifest, and never written to a shared volume. Compromise of the Git repository alone yields nothing.

---

## Table of Contents

- [Architecture](#architecture)
- [Host Prerequisites](#host-prerequisites)
- [1. Age Keypair Generation](#1-age-keypair-generation)
- [2. Secret Encryption Workflow](#2-secret-encryption-workflow)
- [3. Underpost CLI Workflow](#3-underpost-cli-workflow)
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

| Domain   | Owns                                   | Durable source                                                                      | Local runtime                             | Cluster projection                                                   |
| -------- | -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `app`    | one deployment's runtime environment   | `engine-private/conf/<deployId>/.env.<env>[.<sub-conf>]` + `.env.<env>.oci` overlay | working-tree `./.env*` + `Config.default` | `<deployId>-<env>-env` Secret                                        |
| `host`   | the node-level operational environment | `engine-private/deploy/scopes/<scope>.env.<env>`, one file per scope, mode `0600`   | host configuration store `<root>/.env`    | `underpost-config` Secret, and one scoped projection per workload    |
| `secret` | workload credentials                   | `engine-private/secrets/<environment>/<resource>/<id>.enc.yaml` (SOPS/Age)          | one command, through `secret load`        | one Kubernetes Secret per catalog entry, in its resource's namespace |
| `state`  | one container's live execution state   | none — an observation is only true of a running container                           | container state store `<root>/.state`     | in-pod `/_internal/*` endpoints                                      |

### TLS Secrets

A TLS Secret belongs to no domain above, and the SOPS store never holds one. `node bin tls` owns it:
cert-manager issues it into the namespace of its `Certificate` and renews it there, or this machine issues
a self-signed one where the environment says so. A Gateway reads it from its own namespace, so a TLS
Secret and its Certificate live where the Gateway that serves the host runs. The two stores never share a
Secret: `secret` projects the credentials of the catalog, and `tls` the certificates of the hosts.

- `node bin tls reconcile --deploy-id <deploy-id> --env <env> --apply` creates the Certificate of each
  host of a deployment, and `node bin tls status` shows where each Secret is.
- A migration unit prepares the TLS of the hosts of its Gateways before it deletes the source.
- `node bin namespace repair --apply` runs the TLS reconcile of every host.

See [Manage TLS certificates](manage-tls-certificates.md).

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

The `secret` domain has no local store by design. `secret load` gives the decrypted values to one
command and writes them to no store, so no plaintext copy has to be kept in sync.

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

| Concern                | Location                                                                 | Git tracked |
| ---------------------- | ------------------------------------------------------------------------ | ----------- |
| Encrypted manifests    | `engine-private/secrets/<scope>/<resource>/<id>.enc.yaml`                | Yes         |
| Encryption rules       | `engine-private/secrets/.sops.yaml`                                      | Yes         |
| Age **public** keys    | `engine-private/secrets/.sops.yaml` (`age:` recipients)                  | Yes         |
| Secret source policy   | `engine-private/deploy/conf.cluster.json` (`environments.<env>.secrets`) | Yes         |
| Age **private** key    | `~/.config/sops/age/keys.txt` (mode `0600`)                              | **Never**   |
| Offline private backup | Encrypted USB / paper / HSM, off-cluster                                 | **Never**   |

A manifest is keyed by what it is, never by where it runs:

- **The scope** is an environment (`production`, `development`, `test`), `shared` for a resource every
  environment shares, or `external` for a credential Underpost distributes outside the cluster (the
  `GIT_AUTH_TOKEN` mirror). Each environment keeps its own credentials.
- **The resource and the id** come from the resource catalog, `NAMESPACE_RESOURCES` in
  `src/cli/namespace.js`: `mongodb/credentials` is the Secret `mongodb-secret`, `mongodb/keyfile` is
  `mongodb-keyfile`. The catalog is the only list of workload Secrets.
- **No manifest names a namespace.** At apply time, the placement of the environment names the namespace
  of the resource, and `kubectl apply -n` receives it. A move of MongoDB from `default` to
  `underpost-data` changes nothing in the store.

| Reference                     | Kubernetes Secret     | Resource     |
| ----------------------------- | --------------------- | ------------ |
| `mongodb/credentials`         | `mongodb-secret`      | MongoDB      |
| `mongodb/keyfile`             | `mongodb-keyfile`     | MongoDB      |
| `mariadb/credentials`         | `mariadb-secret`      | MariaDB      |
| `mysql/credentials`           | `mysql-secret`        | MySQL        |
| `postgresql/credentials`      | `postgres-secret`     | PostgreSQL   |
| `ipfs/cluster`                | `ipfs-cluster-secret` | IPFS Cluster |
| `observability/grafana-admin` | `grafana-admin`       | Monitoring   |
| `operations/environment`      | `underpost-cron-env`  | Cron jobs    |
| `operations/ssh-key`          | `underpost-ssh-key`   | Cron jobs    |

```
engine-private/
└── secrets/
    ├── .sops.yaml                       # creation rules + recipients (public keys)
    ├── production/
    │   ├── mongodb/
    │   │   ├── credentials.enc.yaml
    │   │   └── keyfile.enc.yaml
    │   ├── mariadb/credentials.enc.yaml
    │   └── observability/grafana-admin.enc.yaml
    ├── development/ …
    ├── shared/ …                        # resources an environment declares `shared`
    ├── external/github/git-auth-token.enc.yaml
    └── .archive/                        # purged and moved manifests; never listed or applied
```

### Secret sources

Each environment declares where the Secrets of each resource come from, in
`engine-private/deploy/conf.cluster.json`:

```json
{
  "environments": {
    "production": {
      "profile": "recommended",
      "secrets": { "mongodb": "sops", "mariadb": "sops", "observability": "sops" }
    }
  }
}
```

| Source      | Behavior                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------- |
| `sops`      | Applies the manifests of the environment. A missing or unreadable manifest stops the install. |
| `shared`    | The same, from the `shared` scope.                                                            |
| `seed`      | Projects the origin seed files (`engine-private/deploy/mongodb-password`, …). The default.    |
| `unmanaged` | Creates and overwrites nothing: the cluster keeps the Secret it holds.                        |

A resource takes all its Secrets from one source. A `sops` resource never falls back to its seed files:
an absent, corrupt or foreign-sealed manifest stops the install before any Secret or workload changes.
`secret setup` writes the declaration when it onboards a resource.

---

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

This is implemented as `UnderpostSecret.API.installTooling()` in `src/cli/secrets.js`, which owns the `SOPS_VERSION` / `AGE_VERSION` pins — verify them against current upstream releases before a fresh host build. `UnderpostCluster.API.initHost()` calls it alongside the existing Helm/Kind installs rather than carrying a second copy, and it reuses `Underpost.baremetal.getHostArch()` instead of a second `uname` parse. Idempotent either way: an already-resolvable binary is left untouched.

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
  - path_regex: .*\.enc\.yaml$
    encrypted_regex: '^(data|stringData)$'
    age: >-
      age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p,
      age1w7yx5kq0h3n2t4mzr9vp8ldjc6fs0eguya3hx2nq7r5tvk9m4dlq8zwptn
```

sops matches `path_regex` relative to the directory of `.sops.yaml`, so the rule names no store prefix. `encrypted_regex: '^(data|stringData)$'` encrypts only the value tree under those keys. `apiVersion`, `kind`, `metadata`, and `type` stay plaintext, so `kubectl`, `kustomize`, and code review all still work on the encrypted file. Listing two recipients means either key can decrypt — the second is the offline break-glass key.

### 2.2 Plaintext manifest

Authored in a `tmpfs` working directory, encrypted, then destroyed. Never committed. It names no
namespace: the placement supplies one at apply time, and the store refuses a manifest that names one.

```yaml
# /dev/shm/underpost-secrets/postgres-secret.yaml  (plaintext — transient, never committed)
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  labels:
    app: postgres
    app.kubernetes.io/managed-by: underpost
type: Opaque
stringData:
  username: admin
  password: 'Zt7#qP2xL9vR4mKe'
  POSTGRES_DB: postgresdb
```

> Key contract: `manifests/postgresql/statefulset.yaml` consumes `secretKeyRef.key: password` for `POSTGRES_PASSWORD`; `POSTGRES_DB` and `POSTGRES_USER` come from the `postgres-config` ConfigMap. Adding `username`/`POSTGRES_DB` here is forward-compatible — moving the StatefulSet onto them is a separate, deliberate change.

### 2.3 Encrypt

```bash
mkdir -p /dev/shm/underpost-secrets && chmod 700 /dev/shm/underpost-secrets
mkdir -p engine-private/secrets/production/postgresql

# Encrypt to a distinct output file (recipients resolved from .sops.yaml).
sops --config engine-private/secrets/.sops.yaml \
     --encrypt \
     /dev/shm/underpost-secrets/postgres-secret.yaml \
  > engine-private/secrets/production/postgresql/credentials.enc.yaml

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
  > engine-private/secrets/production/postgresql/credentials.enc.yaml
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
  > engine-private/secrets/production/postgresql/credentials.enc.yaml.staged \
  && mv engine-private/secrets/production/postgresql/credentials.enc.yaml.staged \
        engine-private/secrets/production/postgresql/credentials.enc.yaml
rm -f engine-private/secrets/production/postgresql/credentials.enc.yaml.staged
```

`UnderpostSecret.API.encrypt()` does exactly this — stage, validate the envelope, then `moveSync` — and refuses to overwrite an existing manifest without `--force`.

### 2.4 Encrypted result

```yaml
# engine-private/secrets/production/postgresql/credentials.enc.yaml  (safe to commit)
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
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
sops --decrypt engine-private/secrets/production/postgresql/credentials.enc.yaml \
  | kubectl apply --dry-run=client -n default -f - -o name
# secret/postgres-secret
```

Commit:

```bash
git -C engine-private add secrets/.sops.yaml secrets/production/postgresql/credentials.enc.yaml
git -C engine-private commit -m "secrets: add the production postgresql credentials"
git -C engine-private push
```

---

## 3. Underpost CLI Workflow

### 3.1 `UnderpostSecret` domain

`secret` is one of the configuration domains, registered from the shared factory in `src/cli/domains.js` so its seven actions and five flags are the same as `host`'s and `app`'s. The SOPS/Age implementation behind them is `src/cli/secrets.js` as `UnderpostSecret.API` — read that file for the authoritative behavior; it is not duplicated here.

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

`--env` selects the store of an environment. A Secret is named by its reference, `<resource>/<id>`, in
`--args names=`. `--namespace` names the namespace of the workloads only: the namespace of each Secret
comes from the placement of its resource.

| Method                                  | Purpose                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `reference(reference)`                  | The catalog Secret of `<resource>/<id>`; refuses a name the catalog does not know                   |
| `manifestPath(secret, environment)`     | Its manifest: `<environment or shared>/<resource>/<id>.enc.yaml`                                    |
| `manifests(scopes?)`                    | Every stored manifest, by scope; `.archive` and `.stage` are never scopes                           |
| `legacyManifests()`                     | The manifests of the namespace-keyed store that wait for `secret setup --args store=legacy`         |
| `manifestMeta(path)`                    | Reads the plaintext envelope: `kind`, name, namespace, whether it is actually encrypted             |
| `assertManifest(path, expect)`          | Fails closed on an unencrypted, non-Secret, misnamed or namespace-naming manifest                   |
| `provide({ resource, namespace })`      | Applies the Secrets of a resource from the source its environment declares                          |
| `applyStore({ environment, secrets })`  | Validates every manifest (envelope, recipients, server dry run), then applies each                  |
| `applyManifest(path, namespace)`        | Streams one manifest through `sops --decrypt` into `kubectl apply -n` under `pipefail`              |
| `applyFromOriginSeed(name, namespace)`  | The `seed` source: projects the origin seed files, staged on tmpfs                                  |
| `encrypt(plaintextPath, outPath)`       | Encrypts into the store through a staged file, and shreds the plaintext source                      |
| `seal({ path, name, data })`            | Writes the plaintext manifest on tmpfs, then `encrypt`s it                                          |
| `readData(secret, environment)`         | Decrypts one stored Secret into memory                                                              |
| `liveData(name, namespace)`             | The data of a live Secret, in memory: what its consumers read                                       |
| `migrateLegacyStore({ environment })`   | Moves the namespace-keyed store into an environment; see [§3.3](#33-move-the-namespace-keyed-store) |
| `setupStore(names, options)`            | Onboarding: tooling, keypair, creation rules, encrypt, declare, validate, apply                     |
| `statusReport(filter, { environment })` | Tooling, key, rules, and per Secret: source, namespace, manifest, decryptability, drift             |
| `rotateRecipient(recipient, options)`   | Re-keys every manifest onto a new recipient; `pruneRecipients` revokes the old ones                 |
| `purge(secret, options)`                | Deletes the live Secret and archives (or with `force`, deletes) its manifest                        |
| `installTooling()`                      | Idempotent install of the pinned `sops` and `age` binaries; owns both version pins                  |

On the production cluster, a change to its Secrets requires the `cluster-secret-administration`
capability of the node role: only the `control` role holds it. Other environments are a development
cluster of the host.

```bash
#   actions: setup | load | publish | apply | status | rotate | clean
#   flags:   --env <env> --namespace <ns> --args <k=v,...> --dry-run --force

# ── workload cluster secrets (SOPS/Age encrypted store) ───────────────────────
node bin secret setup --env production                    # data tier: encrypt, declare `sops`, apply
node bin secret setup --env production --args names=observability/grafana-admin
node bin secret setup --env test --args "names=mariadb/credentials,shared"   # the shared scope
node bin secret setup --env production --args store=legacy --dry-run         # plan the one-time move
node bin secret status --env production                   # source, namespace, manifest and drift of each
node bin secret status --env production --args keys=mongo
node bin secret apply --env production                    # every stored Secret, each in its namespace
node bin secret apply --env production --args names=mongodb/credentials --dry-run
node bin secret load --env development --args "names=mongodb/credentials,run=npm run dev"
node bin secret publish --env production --args path=/dev/shm/underpost-secrets/postgres-secret.yaml,name=postgresql/credentials
node bin secret rotate --args recipient=age1...           # re-key onto a new Age recipient
node bin secret rotate --args "recipient=age1...,prune=true" --force
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,value=<new>,deploy-id=dd-cyberia"
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,value=<new>,deploy-id=dd"   # whole dd.routes fleet
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd" --dry-run
node bin secret rotate --args "secret=SOCKET_CLI_API_TOKEN|SOCKET_CLI_ORG_SLUG|NPM_TOKEN,source=host,deploy-id=dd"
node bin secret rotate --args "secret=NPM_TOKEN,source=host,target=org,deploy-id=template"   # organization mirrors
node bin secret clean --env production --args names=postgresql/credentials --force          # archives the manifest
node bin secret clean --env production --args "names=postgresql/credentials,delete=true" --force

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

`secret load` writes nothing: it runs one command with the named Secrets in that process's environment, as `<NAME>_<KEY>` (`MONGODB_SECRET_PASSWORD`). The values reach no store, file or log.

The `GIT_AUTH_TOKEN` mirror lives in the `external` scope. GitHub holds the credential, and no cluster object reads the mirror, so `secret apply` never applies it.

### 3.2 Cluster initialization

Secrets must exist before the workloads that mount them, so every installer calls `provide` first:

```js
// src/cli/cluster.js — UnderpostCluster.API.init()
if (options.postgresql) {
  const namespace = await placed('postgresql');
  if (options.pullImage) Underpost.cluster.pullImage('postgres:latest', options);
  Underpost.secret.provide({ resource: 'postgresql', namespace, options });
  Underpost.cluster.ensureContainerStorageContexts({ extraPaths: ['/data/postgresql'] });
  applyScheduled('postgresql', 'manifests/postgresql', namespace);
}
```

MongoDB, MariaDB, MySQL, IPFS, the monitoring stack and the cron jobs do the same. MongoDB then reads its
root credentials from the live `mongodb-secret`, so the user it bootstraps matches the Secret its members
mount, whatever the source. A namespace migration provides the Secrets of a unit in its destination
before it deletes the source, and refuses to start when a stored manifest is missing or unreadable.

`assertManifest` reads only the plaintext envelope, so it runs on a host that cannot decrypt:

- no `sops:` block or no `ENC[AES256_GCM` values → the file was never encrypted; refuse and treat its contents as disclosed
- `kind` is not `Secret` → refuse
- `metadata.name` ≠ the Kubernetes name of the catalog entry → refuse, because the apply would succeed while leaving `secretKeyRef` unresolvable
- `metadata.namespace` is set → refuse: only the placement names a namespace

Onboarding one resource from its origin seed files:

```bash
# Encrypt from the seed files, declare `sops`, validate, then apply.
node bin secret setup --env production --args names=postgresql/credentials

# The status names the source, the namespace and the drift.
node bin secret status --env production --args keys=postgres

# Commit the store and the declaration from the host that ran it.
git -C engine-private add secrets deploy/conf.cluster.json
git -C engine-private commit -m "secrets: onboard the production postgresql credentials"
```

Keep the origin seed files until the status shows the live Secret `in-sync` with its manifest.

### 3.3 Move the namespace-keyed store

A store written before this layout keeps `engine-private/secrets/<namespace>/<name>.enc.yaml`.
`secret status` names it. Move it once, from the host that holds a decrypting key:

```bash
node bin secret setup --env production --args store=legacy --dry-run   # the plan: each source and destination
node bin secret setup --env production --args store=legacy
node bin secret status --env production
git -C engine-private add secrets deploy/conf.cluster.json
git -C engine-private commit -m "secrets: move the store to the production scope"
```

For each manifest, the move:

1. maps its name to a catalog Secret, and stops before it writes when a name is unknown or one Secret is stored in two namespaces;
2. decrypts it with sops into memory and seals it without a namespace into `production/<resource>/<id>.enc.yaml`, re-encrypted to the recipients of `.sops.yaml`;
3. verifies the new manifest: its envelope, this host's key, and the same data as the original;
4. archives the originals under `.archive/legacy/` only after every manifest verifies;
5. declares `sops` for each resource whose Secrets are all stored; a resource with a missing Secret keeps its source.

A second run finds nothing to move. The move never changes a credential value, and it applies nothing:
the next install, or `secret apply`, projects the Secrets.

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
for f in engine-private/secrets/production/*/*.enc.yaml; do
  sops --decrypt "$f" | kubectl apply --dry-run=client -n default -f - -o name \
    || { echo "DECRYPT FAILED: $f" >&2; exit 1; }
done
```

### Step 4 — Restore secrets, then workloads

```bash
# Each stored Secret goes to the namespace of its resource. Re-runnable; kubectl apply is idempotent.
node bin secret apply --env production

# Bring up the data plane now that every secretKeyRef resolves.
# A resource declared `seed` takes its origin seed files; a `sops` one never does.
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
  production/mariadb/credentials -> age1mq5jhnym3w2cgexypl5law8my77uvqt2pxaxdqfs8gs0eqcltseq27nquw
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
node bin secret setup --env production --force
```

Any data key with no seed file and no `--args` override is **regenerated**. The running datastore keeps authenticating against its old credential until the new one is applied to it, so `secret setup` warns per key when this happens. Pass the existing value explicitly to avoid it:

```bash
node bin secret setup --env production --args "names=postgresql/credentials,password=<current-password>" --force
```

Verify the outcome either way:

```bash
node bin secret status --env production   # decryptable=yes for every manifest, live/in-sync per secret
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
  sops --decrypt engine-private/secrets/production/postgresql/credentials.enc.yaml >/dev/null

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

### Rotating GitHub Actions secrets

The same verb rotates a credential **value**, selected with `--args secret=`. It writes any
GitHub Actions secret — `GIT_AUTH_TOKEN`, `NPM_TOKEN`, `SOCKET_CLI_API_TOKEN`, `SOCKET_CLI_ORG_SLUG`
— to every repository of a deploy, under a personal account or an organization. `GIT_AUTH_TOKEN`
is the one with a mirror in this store: its authoritative home is the GitHub Actions secret store,
and the encrypted manifest is optional.

```bash
# Preview: which repositories the rotation touches. Contacts nothing, prompts for nothing.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd-cyberia" --dry-run

# Rotate one token. Omit value= to pipe it, read it from the environment, or be prompted with no echo.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,value=<new>,deploy-id=dd-cyberia"

# Mirror the new value into the encrypted store and project it into the cluster.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,value=<new>,store=true,apply=true"

# Sync several keys from the host configuration to the whole fleet, no prompt, no export.
node bin secret rotate --args "secret=SOCKET_CLI_API_TOKEN|SOCKET_CLI_ORG_SLUG|NPM_TOKEN,source=host,deploy-id=dd" --env production
```

A secret name is letters, digits and underscores; the `GITHUB_` prefix is reserved by GitHub.
Several names separate with `|`, `;` or whitespace, because `--args` splits on commas.

#### Where the value comes from

GitHub exposes no API for creating a personal access token, so you generate a PAT yourself at
`github.com/settings/tokens` and the CLI distributes it. Sources are tried in this order:

| Order | Source                                                        | When                                          |
| ----- | ------------------------------------------------------------- | --------------------------------------------- |
| 1     | `--args value=<value>`                                        | Always wins. One key only.                    |
| 2     | Piped stdin                                                   | fd 0 is a pipe or a redirected file. One key. |
| 3     | `$<KEY>`                                                      | Exported in the environment.                  |
| 4     | Host configuration `engine-private/deploy/scopes/*.env.<env>` | The key is declared there (`--env`).          |
| 5     | No-echo terminal prompt                                       | Interactive session, nothing above available. |

`source=host` reads source 4 only. It is what automation uses: the scope files are the durable
record, and a stale export cannot outrank them.

Piping is the source that keeps a value out of both the process table and the shell history:

```bash
printf %s "$TOKEN" | node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd"
```

Stdin is read only when fd 0 is a pipe or a redirected file, decided by `fstat` rather than
`isTTY`: `< /dev/null` is not a terminal either, and reading it would strand the rotation on an
empty value instead of falling through to the next source.

> Stdin deliberately outranks `$GIT_AUTH_TOKEN`. A pipe is what you chose for this run, whereas an
> exported `GIT_AUTH_TOKEN` is very often the **outgoing** token — inside a workflow that maps
> `GIT_AUTH_TOKEN: ${{ secrets.GIT_AUTH_TOKEN }}`, taking it would re-set the value being replaced
> and report a rotation that never happened. (`$GITHUB_TOKEN` is excluded as a source entirely, for
> the same reason: it is what `gh` authenticates _with_.)

#### Where the value goes: user account or organization

The target is resolved from the host configuration, so one setting moves every rotation from the
personal account to the organization. `--args target=`, `owner=` and `level=` override it per run.

| Variable              | Values          | Effect                                                                                                                                |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_TARGET_TYPE`  | `user` \| `org` | Account type the derived repository names resolve under. Default `user`.                                                              |
| `GITHUB_USERNAME`     | account login   | Owner for `user`, after the owner of `ENGINE_SRC_REPO`. Default `underpostnet`.                                                       |
| `GITHUB_ORG_NAME`     | organization    | Owner for `org`. Required with `GITHUB_TARGET_TYPE=org`.                                                                              |
| `GITHUB_SECRET_TOKEN` | PAT             | Credential `gh` writes with, passed as `GH_TOKEN`. `repo` scope; `admin:org` too for `level=org`. Unset: the `gh auth login` account. |

All four are host-scope keys (`engine-private/deploy/scopes/host.env.production`), as are
`SOCKET_CLI_API_TOKEN` and `SOCKET_CLI_ORG_SLUG`; `NPM_TOKEN` is a publishing-scope key. `host load`
projects them into the host store, and `source=host` reads them from the files directly.

`level=` decides where a value lands:

| Level  | Write                                                                                                                                                                 | Works for                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `repo` | `gh secret set KEY --repo owner/repo`, once per repository. Default.                                                                                                  | Both account types.                                                               |
| `org`  | `gh secret set KEY --org ORG --visibility selected --repos a,b`, one secret for the organization's repositories; a repository under another owner still gets its own. | Organizations. A free organization cannot share it with its private repositories. |

Under an organization target every derived name — and every declared one, an instance repository
or `ENGINE_SRC_REPO` — is re-owned to the organization: the mirrors carry the same repository
names, and a write that followed the declared owner would land on the account being migrated from.
Names the organization does not hold are dropped by the reachability probe, like any other.

```bash
# The organization mirrors of the template lineage, from the host configuration.
GITHUB_TARGET_TYPE=org GITHUB_ORG_NAME=underpost \
  node bin secret rotate --args "secret=NPM_TOKEN|GIT_AUTH_TOKEN,source=host,deploy-id=template" --dry-run

# One organization secret, visible to the deploy's repositories only.
node bin secret rotate --args "secret=NPM_TOKEN,source=host,target=org,owner=underpost,level=org,deploy-id=dd-cyberia"
```

#### Rotating the whole fleet

`deploy-id=dd` is the meta id every runner reads as "all of `engine-private/deploy/dd.routes`",
resolved through the same reader the cluster deploys from — so a rotation covers exactly the fleet
that is running, and cannot drift from it by parsing the route table a second time. Each deploy
contributes its triple (private conf, production source, test source); the union is deduplicated,
so a repository two deploys share is rotated once.

```bash
# 1. See the whole target set first. dd.routes decides it; targets are probed read-only,
#    and nothing is prompted for or written.
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=dd" --dry-run

# 2. Rotate the fleet. Reads the environment or the host configuration, else prompts with no echo.
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
secrets — `dd-cyberia` builds from `cyberia-server` and `cyberia-client` — so a rotation that
covered only the engine repositories would leave half the deploy on the previous credential. Under
a user target an instance keeps the owner its `metadata.repository` declares, which outranks
`owner=`; under an organization target it is re-owned like every other name.

Derived names that do not exist on GitHub are dropped by the reachability probe, so there is no
separate existence check: a deploy with no ghpkg mirror or no test source simply contributes
fewer targets. `owner=` overrides the GitHub owner for the derived names, and
`repos=owner/one|owner/two` adds targets, taken as written — with `|`, `;` or whitespace, because
`--args` splits on commas.

`template` is the second meta id alongside `dd`. The template lineage carries no conf id, so it
resolves to its own repositories rather than through `engine-<conf-id>` naming:

```bash
node bin secret rotate --args "secret=GIT_AUTH_TOKEN,deploy-id=template" --dry-run
#   pwa-microservices-template
#   pwa-microservices-template-ghpkg
#   engine
```

| Parameter     | Effect                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `secret=`     | The secret name(s), `\|`-separated.                                                                           |
| `value=`      | The value, for a single key. Omit it to fall through the sources above.                                       |
| `source=host` | Read the host configuration only.                                                                             |
| `deploy-id=`  | The deploy(s) to rotate: an id, a `\|`-separated list, `dd` for all of `dd.routes`, or `template`.            |
| `target=`     | `user` or `org`. Falls back to `$GITHUB_TARGET_TYPE`, then `user`.                                            |
| `owner=`      | GitHub owner. Falls back to `$GITHUB_ORG_NAME` (org) or `$ENGINE_SRC_REPO`'s, then `$GITHUB_USERNAME` (user). |
| `level=`      | `repo` (default) or `org`.                                                                                    |
| `repos=`      | Extra `owner/repo` targets, separated by `\|`, `;` or whitespace.                                             |
| `store=true`  | `GIT_AUTH_TOKEN`: mirror into the encrypted store even when no manifest exists yet.                           |
| `apply=true`  | `GIT_AUTH_TOKEN`: project the updated manifest into the cluster.                                              |

Requires the GitHub CLI, authenticated as an account holding **admin** on the targets — writing
an Actions secret needs it:

```bash
gh auth login          # or: GITHUB_SECRET_TOKEN=… (the credential gh writes with, not the new value)
gh auth status
```

Behaviour worth knowing before you run it:

- **GitHub is written first, the store second.** A credential is only real once GitHub holds it.
  A store that leads GitHub records a value no workflow can use; a GitHub that leads the store
  converges on the next run. Every write is idempotent, so a partially failed rotation is
  re-runnable with the same values.
- **An unreachable target is skipped, not fatal.** A deploy does not necessarily own every
  repository its naming implies — a test source repo often does not exist — and a missing one must
  not leave the private conf repo un-rotated. Targets that resolve but fail to write are collected
  and raised at the end, after the successful ones are on record. If _nothing_ rotated, the store
  is left untouched so it keeps recording the credential GitHub is actually running on.
- **The value is never a command argument.** It is staged on tmpfs at mode 600, handed to
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
>   - path_regex: .*\.enc\.yaml$
>     encrypted_regex: '^(data|stringData)$'
>     # age1ql3z…mcac8p  operator: <operator email>
>     # age1w7yx…8zwptn  break-glass: offline safe
>     # age1ci9k…4mfp2q  automation: engine-cd runner
>     age: age1ql3z…mcac8p,age1w7yx…8zwptn,age1ci9k…4mfp2q
> ```

Rotation is also partially-applied-safe in the other direction: if verification fails on manifest N, the store is left with 1..N-1 re-keyed and the error says so. Re-running after fixing the cause is safe — `updatekeys` is idempotent per file.

Credential rotation (new password) is a different operation — it changes the value and does require a rollout:

```bash
sops engine-private/secrets/production/postgresql/credentials.enc.yaml   # edit in $EDITOR, re-encrypts on save
node bin secret apply --env production --args names=postgresql/credentials
kubectl rollout restart statefulset/postgres -n "$(node bin namespace resolve postgresql --env production --plain)"
```

---

## Emergency Purge

`secret clean --args names=<resource>/<id>` removes that Secret from the namespace of its resource and takes its manifest out of the store of the environment. `--force` is required because the deletion is cluster state. The manifest is **archived, not deleted**, so the purge stays reversible; `--args delete=true` removes it outright.

Disposition is deliberately not `--force`'s job: `--force` authorizes touching the cluster, `delete=true` authorizes losing the manifest. Folding them into one flag would make every purge permanent and leave the archive path unreachable.

```bash
# Preview: what gets deleted, and the source the environment declares.
node bin secret clean --env production --args names=postgresql/credentials --dry-run --force

# Delete the live Secret; archive the manifest under engine-private/secrets/.archive/.
node bin secret clean --env production --args names=postgresql/credentials --force

# Irreversible variant — no archive copy is kept.
node bin secret clean --env production --args "names=postgresql/credentials,delete=true" --force
```

A purge never re-arms the seed files. While the environment declares the resource `sops`, its next install
stops until the manifest returns, and the purge says so. To fall back on the seed files, declare the
resource `seed` in `conf.cluster.json`.

Restoring from the archive:

```bash
ls engine-private/secrets/.archive/production/postgresql/
mv engine-private/secrets/.archive/production/postgresql/credentials.2026-08-03T14-22-07-000Z.enc.yaml \
   engine-private/secrets/production/postgresql/credentials.enc.yaml
node bin secret apply --env production --args names=postgresql/credentials
```

`.archive` is dot-prefixed, so no listing, status or apply reads it.

---

## Operational Invariants

| Invariant                                                                | Enforced by                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Plaintext secrets never reach persistent storage                         | Authoring in `/dev/shm`; `sops --decrypt \| kubectl apply -f -`             |
| A decrypt failure never applies an empty manifest                        | `set -o pipefail` around every decrypt/apply pipe                           |
| A failed encrypt never destroys the manifest it was replacing            | Staged temp file + validate + `moveSync`, never a bare `>` redirect         |
| A manifest is never double-encrypted                                     | `encrypt()` refuses a source that already carries sops metadata             |
| An unencrypted or mismatched manifest is never applied                   | `assertManifest()` envelope check, before any decrypt, needs no key         |
| A stored resource never falls back to its seed files                     | `provide()` takes one declared source; a missing manifest stops the install |
| A manifest never names a namespace, so a move never changes the store    | `assertManifest()` refuses one; `kubectl apply -n` takes the placement      |
| A store is never left half-applied by a mid-loop failure                 | Validate-then-commit: envelope + server dry run of all, then apply          |
| The Age private key never enters Git, a manifest, or a container         | `.gitignore` on `keys.txt`; `SOPS_AGE_KEY_FILE` path-only pointer           |
| The private key is never exposed in process listings                     | `SOPS_AGE_KEY_FILE`, never `SOPS_AGE_KEY`; `disableLog` on every sops call  |
| A group/world-readable private key is never used                         | `assertKeyFile()` rejects any mode with `0o077` bits set                    |
| A key-path mismatch is diagnosable, not a mystery decrypt failure        | `keyFileCandidates()` names every path tried, including the `sudo` case     |
| A host never encrypts into a store it cannot read back                   | `init()` registers the local recipient in an inherited `.sops.yaml`         |
| A foreign-sealed manifest is named and explained, not failed inside sops | `assertDecryptable()` pre-flight before apply, rotate, and the decrypt pipe |
| A manifest cannot be encrypted to an unlisted recipient                  | Committed `.sops.yaml` `creation_rules`                                     |
| Recipients are never revoked by accident                                 | Prune refuses without `--force`; `--dry-run` lists the revoked set first    |
| A rotation is never reported complete while a file stays on the old key  | Post-`updatekeys` re-read asserts the new recipient is in the `sops:` block |
| Secrets exist before the workloads that mount them                       | Every installer calls `provide()` before it applies its manifests           |
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

Post-deploy filesystem cleanup already exists as `UnderpostSecret.API.globalSecretClean()` in `src/cli/secrets.js` — it clears `engine-private`, `.env`, and the conf cache. It intentionally does **not** touch `~/.config/sops/age/keys.txt`: the key must survive so the node can re-apply secrets on restart. Container images must never receive it — pods consume the resulting Kubernetes Secret, never the Age key.
