# Verify on a disposable cluster

Unit and harness tests prove the planning rules of the target, the storage planner, the migration, the
routing and the TLS lifecycle. They read a fake cluster. This procedure gives the evidence that
[ADR 0011](../../underpost/adr/0011-cluster-topology-and-node-group-scheduling.md),
[ADR 0012](../../underpost/adr/0012-resource-migration-and-recreation.md),
[ADR 0014](../../underpost/adr/0014-operational-cli-domains.md) and
[ADR 0015](../../underpost/adr/0015-tls-lifecycle-and-the-acme-issuer.md) list as pending. Until a step
passes, its capability stays unverified.

## Rules

- Use a cluster you create for the test and delete after it. Never use production or a cluster that
  holds data you keep.
- Use the `test` environment of a scratch `engine-private/deploy/conf.cluster.json`. Name the context of
  the disposable cluster there, and declare its identity:

  ```bash
  node bin namespace target --env test --context <disposable-context>
  ```

  Copy the printed `cluster` value into `environments.test.cluster`. Every change then refuses another
  cluster.

- Use the distribution, the storage provisioner, the Gateway controller and the cert-manager release of
  production: kubeadm for production evidence, kind only for a first pass.
- Keep the output of each step: the commands, the `--json` reports and the `kubectl` state.

## Infrastructure

| Need                              | For                    |
| --------------------------------- | ---------------------- |
| One node                          | Steps 1, 3, 5, 6       |
| Two nodes, each with a host path  | Steps 2, 3, 4, 7       |
| Contour and Envoy Gateway         | Steps 6 and 7          |
| The shared edge on one node       | Step 8                 |
| A public host name and DNS        | The ACME staging steps |
| Port 80 and 443 from the internet | The ACME staging steps |

## Cluster steps

| Step | Do                                                                                                             | Passes when                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Install MongoDB and one workload on one node; `namespace audit`                                                | No error finding; `namespace target` says `verified`                                                              |
| 2    | Two node groups; deploy a workload on two nodes and a datastore on one                                         | Each pod runs on its group; the datastore refuses a group of two nodes                                            |
| 3    | `run node-move` of the datastore to the other node                                                             | Refused: the node does not hold its host path; nothing changes                                                    |
| 4    | For MongoDB, MariaDB, Valkey and IPFS: write test data and its checksum; capture, plan, migrate with `--apply` | The plan names the lifecycle and each data outcome; the data after the run matches them; no source object remains |
| 5    | Start a long backup Job and a DNS Job, then migrate MongoDB                                                    | The backup Job blocks the unit, the DNS Job does not; no CronJob changes its `suspend`                            |
| 6    | Deploy one host with `gateway-api`, then with `contour`                                                        | Each provider serves the host; `ingress audit` shows no error                                                     |
| 7    | Change `routing.provider` of a deployed host; deploy; `ingress reconcile --apply`                              | The old route stays until the new one serves; the edge moves the host then; no 404 during the move                |
| 8    | `run ingress-refresh`, then again with `--ingress-node <other node>`                                           | The status documents, host files and host table reach the node before traffic moves; every host answers           |

Interrupt step 4 once after its `delete` operation (stop the CLI). A second plan from another host is then
refused while the Lease `kube-system/underpost-namespace-migration` is held, and `namespace migrate --resume`
of the first plan on the first host continues it: nothing is deleted twice, and the Lease is gone when it
ends.

## Data steps

Verify a change of the data plane on a copy of production in the development sandbox
([Replicate production data](run-a-development-sandbox.md#replicate-production-data)):

| Step | Do                                                                                     | Passes when                                                                        |
| ---- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | `db --inspect --backup <id>`, then `db --import --dev --backup <id> --drop`            | `db collection inspect --dev` counts the documents `--inspect` printed             |
| 2    | `npm run dev <deploy-id>`; sign in with a production account; open each view with data | The account signs in; each view shows the restored data                            |
| 3    | Run the migration under test, such as `--rename-database` and `content release rebase` | Steps 1 and 2 pass again on the migrated names; the source databases are unchanged |

## ACME staging steps

Give the `test` environment `{"mode": "cert-manager", "issuer": "letsencrypt-staging"}` and a public host
that resolves to the public edge. Then, for each provider:

```bash
node bin tls issuer status --env test
node bin tls reconcile --host <host> --env test --apply
node bin tls audit --host <host> --env test
openssl s_client -connect <host>:443 -servername <host> </dev/null | openssl x509 -noout -subject -issuer -dates
node bin tls renew --host <host> --env test --apply
```

The step passes when the challenge route is accepted, the Certificate is Ready, the Secret holds the host,
the external handshake serves the staging chain for the host, and a renewal replaces the Secret. A
self-signed certificate is no substitute for this step.

## Record the result

Write each step that passed, its date and its cluster fingerprint into the `Verification` section of the
ADR that lists it, and remove it from `Not done`.
