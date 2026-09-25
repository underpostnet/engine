# The shared Underpost CLI

The CLI is the platform's own surface, shared by every domain that deploys on it. Nexodev
documents how to use it for infrastructure work; this records what it is and the rules it
keeps, which is why a product domain never redefines it as its own.

## Underpost CLI

`underpost` is the shared control surface for platform operations. Top-level commands (`underpost <cmd> --help` for options):

| Group              | Command          | Purpose                                                       |
| ------------------ | ---------------- | ------------------------------------------------------------- |
| **Project / repo** | `new`            | Initialize a new project, service, or configuration           |
|                    | `clone`          | Clone a GitHub repository into the current directory          |
|                    | `pull`           | Pull latest changes from a repository                         |
|                    | `cmt`            | Manage commits (commit types and options)                     |
|                    | `push`           | Push committed changes to a remote repository                 |
|                    | `install`        | Import Underpost npm dependencies by copying                  |
|                    | `root`           | Print the npm installation root path                          |
| **Build / config** | `client`         | Build client assets / single replicas; sync environment ports |
|                    | `static`         | Static build of pages, bundles, and documentation             |
|                    | `env`            | Set env vars and config for a deploy ID                       |
|                    | `config`         | Manage Underpost configuration via operators                  |
|                    | `metadata`       | Import/export cluster metadata                                |
| **Deploy / infra** | `cluster`        | Manage Kubernetes clusters (defaults to Kind init)            |
|                    | `deploy`         | Manage deployments (defaults to development pods)             |
|                    | `image`          | Build, save, and load Docker images into clusters             |
|                    | `secret`         | Manage secrets across platforms                               |
|                    | `lxd`            | Manage LXD VMs as K3s nodes (control plane / workers)         |
|                    | `baremetal`      | Bare-metal provisioning workflows                             |
|                    | `ip`             | Show current public machine IP addresses                      |
| **Data / ops**     | `db`             | Database backup / restore and related operations              |
|                    | `cron`           | Run cron jobs or generate/apply K8s CronJob manifests         |
|                    | `fs`             | File storage (defaults to upload)                             |
|                    | `monitor`        | Health-server monitoring for deployments                      |
|                    | `ssh`            | Manage SSH credentials and sessions for cluster nodes         |
|                    | `run`            | Run scripts via named runners                                 |
|                    | `test`           | Run the test suites                                           |
|                    | `socketsecurity` | Dependency and source code security audit, Socket patches     |
|                    | `release`        | Release orchestrator for building and shipping CLI versions   |

Cyberia-specific operations belong in `cyberia`, not in parallel platform commands. Use the base CLI for infrastructure and delivery, then layer Cyberia workflows on top.

---

## Operational rules

- Prefer one source of truth for config, deploy IDs, runtime selection, startup behavior, and generated assets.
- Reuse existing helpers and conventions instead of creating parallel implementations.
- Do not duplicate parsing, env resolution, or path normalization logic across modules.
- Treat generated artifacts as outputs only; never hand-edit them.
- `engine-private/` is a private external dependency. Reference it as private input only and never assume its contents exist locally.

---

## Safety and orchestration

- Any host-level change must be idempotent, reversible, and explicit.
- Never assume mounts, users, groups, namespaces, or volumes already exist.
- Validate before mutating: check paths, permissions, ownership, and target state first.
- Keep orchestration scripts resilient to interruption and safe to rerun.
