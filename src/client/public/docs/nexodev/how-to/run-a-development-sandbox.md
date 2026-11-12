# Run a Development Sandbox

A Development Sandbox is an isolated Kind cluster on this host, with MongoDB and Valkey, and IPFS on
request. One `underpost sandbox up` session exposes its services on `127.0.0.1` until Ctrl+C. A
development engine and the development commands of a product use those addresses.

A sandbox is not a node role and not a WireGuard peer. A workstation can host it; a fleet node
(`hub`, `control`, `worker`) cannot. A sandbox never becomes a fleet member.
[ADR 0009](../../underpost/adr/0009-cyberia-development-sandbox-and-lifecycle-monitor.md) records
the decisions.

## Before you start

- Docker, `kind` and `kubectl`: `node bin cluster --init-host` installs them.
- Root, or `sudo` without a prompt: the session writes the MongoDB member name to `/etc/hosts`.
- The Kind context in your kubeconfig, `kind-kind` by default. `node bin cluster --kind` and
  `sandbox up` merge it and keep your current context.

`up` pins the sandbox context for itself and for every command it starts: provisioning, the
forwards and the MongoDB primary lookup act on the sandbox, whatever context is current. When
`engine-private/deploy/conf.cluster.json` names a development context, it must be the sandbox
context; `up` refuses another one.

## Start the sandbox

```bash
node bin sandbox up
```

`up` does these steps in order:

1. It creates the Kind cluster `kind` when this host has none (`underpost cluster` creates the same
   one). It never resets a cluster.
2. It provisions MongoDB and Valkey when the cluster lacks them, through `underpost cluster --dev`.
   It never resets a database or deletes a volume. `--ipfs` also provisions the IPFS Cluster.
3. It opens one forward per service, pinned to the sandbox context and bound to `127.0.0.1`:

| Service      | Address           | Kubernetes resource             |
| ------------ | ----------------- | ------------------------------- |
| MongoDB      | `127.0.0.1:27017` | the primary pod of `mongodb`    |
| Valkey       | `127.0.0.1:6379`  | `svc/valkey-service`            |
| IPFS API     | `127.0.0.1:5001`  | `svc/ipfs-cluster`, Kubo RPC    |
| IPFS Cluster | `127.0.0.1:9094`  | `svc/ipfs-cluster`, Cluster API |
| IPFS gateway | `127.0.0.1:8080`  | `svc/ipfs-cluster`, Kubo        |

Keep the terminal open. Every 10 seconds the session checks each service with its own protocol: a
MongoDB `hello` that names the primary, a Valkey `PING`, and an HTTP call to IPFS. It opens again a
forward that exits, or that fails two checks in a row; a MongoDB election moves the forward to the
new primary. The session ends when the identity of the cluster changes: run `up` again.

Ctrl+C, SIGTERM or `node bin sandbox down` stop every forward. When the session process dies in
any other way, its forwards stop too.

To develop against the sandbox:

```bash
node bin sandbox up          # terminal 1
npm run dev dd-cyberia       # terminal 2
```

`node bin run dev` and `node bin run metadata` open the same session in their own process.

## The `--dev` flag

`--dev` means one thing: the command runs on this host and uses the live sandbox.

- It reads the development env of the deployment.
- It reaches MongoDB through the sandbox forward, as the one member the forward serves. The member
  names of the replica set resolve only inside the cluster.
- The `cyberia` commands reach Valkey and IPFS through their forwards too.
- `underpost db` and `underpost metadata` act on the sandbox cluster: they need no `--context`.
- Without a live session, the command refuses and says how to start one.

These commands take it: `underpost db` (with `db collection`), `underpost metadata`, and the content,
instance, release and audio commands of `cyberia`.

A development process on this host, such as `npm run dev`, reaches the same forwards: its development
env names `127.0.0.1` and the default port of each service, and it connects to the MongoDB forward as one
member.

The word `development` has other meanings: the `development` environment of `conf.cluster.json` and
of a deployment, and `NODE_ENV=development` of an app or a container. A command chooses them with its
`[env]` argument or `--env development`.

## Replicate production data

Restore a production backup into the sandbox to reproduce a problem with real data, or to rehearse a
migration. The backups live in the object store; the host needs `UNDERPOST_BACKUP_KEY` to open them.

```bash
node bin sandbox up --ipfs                                    # terminal 1
node bin db dd-cyberia --list                                 # terminal 2: pick a backup
node bin db dd-cyberia --inspect --backup <backup-id> --hosts services.cyberiaonline.com
node bin db dd-cyberia --import --dev --backup <backup-id> --hosts services.cyberiaonline.com --drop
node bin db collection inspect user --dev --deploy-id dd-cyberia --host services.cyberiaonline.com
npm run dev dd-cyberia                                        # the app on this host, on the restored data
```

The import restores each database the selected hosts declare. When the deployment renamed a database
after the backup, the import names the databases the backup holds: restore them under the new names
with `--rename-database <old>:<new>`, then, for Cyberia, run
`node bin/cyberia content release rebase --dev --apply`.

A collection operation reads a backup without an import: `--dev --source-backup-id <backup-id>` stages
the source collections in the sandbox, as in
[Give a site its own database](manage-databases-and-backups.md#give-a-site-its-own-database).

## Check the sandbox

```bash
node bin sandbox status
```

`status` prints JSON: the identity of the sandbox, the current context, the session and each
service. Each service names its owner:

| Owner     | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| `sandbox` | A forward of the session holds the port                    |
| `foreign` | Another process answers on the port: it is not the sandbox |
| `none`    | Nothing listens                                            |

A `foreign` MongoDB is often a forward to production, such as `underpost run expose mongodb-0`.
Stop that process: the sandbox never stops a process it did not start, and `up` refuses a port in
use.

## Place the services

Each service runs in the namespace the `development` section of
[the placement](place-resources-in-namespaces.md) names, `default` without one. An option moves one
service for this command; `up` creates a namespace that does not exist yet.

```bash
node bin sandbox up --namespace-mongodb dd-data --namespace-valkey dd-cache
```

Give `status` and `down` the same options as `up`.

## The identity of a sandbox

The sandbox id is the name of its Kind cluster, `kind` by default. Its fingerprint is a sha256 of
the hostname and WireGuard peer of this host, the cluster, its context and API server, the uid of
its `kube-system` namespace, and the namespace of each service with its uid. A recreated cluster or
namespace has a new uid, so it has a new fingerprint under the same names. A product records its development work
against the fingerprint: the Cyberia content lifecycle does not let a recreated sandbox inherit a
restore.

`up`, `status` and `down` take another cluster name as their second argument. Only one session can
hold the service ports at a time.

## Reset a sandbox

Starting a sandbox never deletes data. To start from empty data, reset explicitly:

```bash
node bin cluster --reset                                   # delete the Kind cluster
node bin cluster --dev --mongodb --reset-mongodb           # or: wipe only the MongoDB volumes
node bin sandbox up
```

## Troubleshooting

| Message                                                | Action                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `The kubeconfig context is <x>, not the sandbox`       | Run the command through `node bin sandbox up`, which pins it      |
| `conf.cluster.json names the development context <x>`  | Set `development.context` to the sandbox context, or remove it    |
| `Context kind-kind points at <url>, not at a Kind API` | Export the Kind kubeconfig: `kind export kubeconfig --name kind`  |
| `In use by another process: MongoDB 127.0.0.1:27017`   | Stop that process; check it with `node bin sandbox status`        |
| `Sandbox kind has a session already (pid <pid>)`       | Use that session, or stop it with `node bin sandbox down`         |
| `<node> is a control node, a fleet member`             | Run the sandbox on a workstation                                  |
| `IPFS Cluster volumes exist without their StatefulSet` | `node bin cluster --dev --ipfs` recreates them; run it on purpose |
| `The identity of cluster kind-kind changed`            | The cluster was recreated: run `node bin sandbox up` again        |
