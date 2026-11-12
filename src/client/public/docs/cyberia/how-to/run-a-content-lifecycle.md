# Run a content lifecycle

Run one content cycle of a deployment across its hosts: back up, capture the content production
serves, review it as source, release it and deploy it. Each command records its stage in the cycle,
so every host sees where the cycle is and what comes next.
[The content lifecycle](../explanation/content-lifecycle.md) explains the stages and the contexts.
[The CLI reference](../reference/cyberia-cli.md#cyberia-content-lifecycle--content-lifecycle) lists
every option.

Run the commands from the engine checkout of each host. `<cycle-id>` is the `cycleId` that `start`
prints. `<baseline-id>` is the id in the capture line `Baseline <baseline-id> of release … is
available`, for example `20261105T211036Z-f3d2e6`. It is not the dbHash at the end of that line.
`content lifecycle plan <cycle-id>` prints each next command with both ids, in the form you run it:
a control node command names the Cyberia deploy with `--env-path`.

## Hosts

| Host                    | Node role     | Stages it runs                                                  |
| ----------------------- | ------------- | --------------------------------------------------------------- |
| Production control node | `control`     | start, preflight, backup, capture, share, deploy, runtime check |
| Developer workstation   | `workstation` | restore, export, workspace reset, source review, source release |

A worker and a hub run no stage. The cycle lives in the runtime database of the production
deployment. The control node reaches it by itself. A workstation reaches one cycle through a share:
see [Connect the workstation](#5-connect-the-workstation). It writes development data only to its
Development Sandbox: see [Start the Development Sandbox](#6-start-the-development-sandbox).

Each stage completes for one target: the deployment, the sandbox of one workstation, or the
`cyberia-content` checkout of one workstation. A restore on another workstation does not complete
the restore of this one.

## 1. Prepare the control node

```bash
node bin cmt --switch-repo <engine-repository>
npm install
node bin pull ./engine-private underpostnet/engine-private
node bin host load
```

`cmt --switch-repo` replaces the checkout with the engine release, for example
`underpostnet/engine-test-cyberia`. `npm install` installs the packages its manifest declares:
without them, the CLI does not load (`Cannot find package 'pngjs'`). `host load` loads the
production host configuration.

The `.env` that `host load` writes names the deploy of the host (`dd-core`), not the Cyberia deploy.
Each `node bin/cyberia` command on the control node names the Cyberia deploy with
`--env-path ./engine-private/conf/dd-cyberia/.env.production`. A lifecycle command without it
refuses before it connects.

## 2. Start the cycle

`deploy/dd-cyberia/content-lifecycle.sh` runs steps 2 to 5 in one command: see
[Run the control node stages in one command](#run-the-control-node-stages-in-one-command).

```bash
node bin/cyberia content lifecycle start --instance test,amethyst-strata-expansion \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
node bin/cyberia content lifecycle doctor <cycle-id> --env-path ./engine-private/conf/dd-cyberia/.env.production
```

`--instance`, `--saga`, `--map` and `--item` name the scope of the cycle: what it is about. The scope
does not limit a stage: the capture always takes every world the active release serves. `doctor`
records the preflight. Every later stage waits for it.

On the control node, each command opens a forward to the MongoDB primary for the length of its run.
The member names of the replica set resolve only in the cluster. The forward stops when the command
ends, also on an error or Ctrl+C.

## 3. Back up the infrastructure

```bash
node bin db dd-cyberia --kubeadm --export --prune
node bin db dd-cyberia --kubeadm --verify --restore-test
node bin/cyberia content lifecycle verify infrastructure-backup --cycle <cycle-id> \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
```

The verifier takes the newest backup made since the cycle started that has a passing restore drill.
A backup made before `start` joins with `--backup <backup-id>`.

## 4. Capture the production content

The capture is the snapshot of every world production serves: the active release database with its
worlds, maps, quests and item bindings, the Files they reference, the ledger row of the release and
the CIDs players own. It goes to the object store. Git never carries it.

```bash
node bin/cyberia content baseline capture --cycle <cycle-id> --env-path ./engine-private/conf/dd-cyberia/.env.production
node bin/cyberia content baseline verify --cycle <cycle-id> --env-path ./engine-private/conf/dd-cyberia/.env.production
node bin/cyberia content lifecycle handoff <cycle-id> --env-path ./engine-private/conf/dd-cyberia/.env.production
```

The cycle keeps the baseline that the capture made, so `verify` needs no baseline id. The
workstation turns the baseline into source in [step 7](#7-export-the-baseline-on-the-workstation).
Give the handoff text to the operator of the workstation.

## 5. Connect the workstation

The workstation is a WireGuard peer of the hub with the node role `workstation`. It is not a
Kubernetes node. The hub lets it open only TCP `7735` on the fleet nodes. Its development database
must not be the production replica set: the restore and the reset refuse it.

Enroll it once. [Workstation peers](../../nexodev/how-to/run-the-edge-hub.md#workstation-peers) has
the steps. `content lifecycle handoff` lists the enrolled workstations of the hub.

On the control node, open the cycle to the workstation in a terminal of its own, and keep it open
while the workstation works:

```bash
node bin/cyberia content lifecycle share <cycle-id> --peer-id <workstation-peer-id> \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
```

`share` checks that the peer is a workstation of the hub, binds the share to the WireGuard address
of the control node, records the share in the journal and prints one line. Run that line on the
workstation, in each terminal that runs a lifecycle command or the development engine:

```bash
export CYBERIA_LIFECYCLE_SHARE=<the value the share prints>
```

The value is a URL that holds the token of the share: give it only to the operator of that
workstation, and never paste it in a ticket or a log. Only that peer, with that value, reads the
cycle and records the stages of its role, for its own targets. The share lives 8 hours by default
(`--hours`, at most 24). Press Ctrl+C in the terminal of `share` when the workstation stages are
complete; the share also closes when the tunnel of the control node goes down. If the share process
dies, its lease lapses in 90 seconds and the share is expired. To end a share that leaked:

```bash
node bin/cyberia content lifecycle revoke-share <cycle-id> <share-id> --reason "the value leaked" \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
```

`share` prints the share id; `content lifecycle inspect <cycle-id>` lists the shares of a cycle.
Without the variable, a `--dev` command reads the development database and `--cycle` fails with
`No content lifecycle <cycle-id> in the development database of this host`.

## 6. Start the Development Sandbox

On the workstation, start the sandbox in a terminal of its own and keep it open:

```bash
node bin sandbox up
```

`up` creates the Kind cluster when it is missing, provisions MongoDB and Valkey when they are
missing, and forwards them to `127.0.0.1:27017` and `127.0.0.1:6379`. It never resets data. The
development configuration of `dd-cyberia` (`.env.development`) uses these addresses.
[Run a Development Sandbox](../../nexodev/how-to/run-a-development-sandbox.md) has the details.

Check the workstation before the restore:

```bash
node bin sandbox status
node bin/cyberia content lifecycle doctor <cycle-id> --dev
```

In the `doctor` report, read the `sandbox` section:

| Field                 | Expected                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `target.id`           | `sandbox:<your-peer-id>/kind`                                        |
| `session.kubeContext` | `kind-kind`                                                          |
| `services`            | MongoDB and Valkey with `ready: true`                                |
| `productionExclusion` | `verified: not the replica set of baseline <baseline-id>`            |
| `baselineRestore`     | `not restored` before the restore, `restored: <database> …` after it |

If `sandbox.refused` says that the development database is not the MongoDB of a Development Sandbox
session, start the session, or stop the process that holds `127.0.0.1:27017`.

## 7. Export the baseline on the workstation

Phase A rebuilds the production content as source:

```bash
node bin/cyberia content lifecycle doctor <cycle-id> --dev
node bin/cyberia content baseline restore <baseline-id> --confirm <baseline-id> --cycle <cycle-id> --dev
node bin/cyberia content source export-live --baseline <baseline-id> --dev
node bin/cyberia content source export-live --baseline <baseline-id> --apply --cycle <cycle-id> --dev
git -C cyberia-content add src/content
git -C cyberia-content commit
```

The restore downloads the baseline, restores its release database into the sandbox MongoDB, then
reads back each collection, the Files and the ledger row.

The export reads the baseline only. It restores the baseline into a scratch database, adds what the
foundation of the artifact adds, exports each world and the global content from there, then drops
the scratch database. It never reads or writes the workspace, so one baseline and one foundation
always export the same files. The first export writes nothing: read its plan. The second writes each
world into `src/content/instances/<code>/` and the global content into `src/content/global/`. It
refuses when those directories hold uncommitted changes.

Put the `Baseline:` line that the export prints in the commit message. This commit is the baseline
revision.

## 8. Load the baseline revision into the workspace

Phase B gives the Studio the production content:

```bash
(cd cyberia-content && node bin/cyberia-content.js build)
node bin/cyberia content workspace reset --confirm dd-cyberia --cycle <cycle-id> --dev
```

The build writes the artifact of the baseline revision. The reset refuses until the artifact is the
build of the committed export of the cycle. Then it drops the content of the workspace and every
Object Layer definition in it, imports the artifact, and checks that the workspace holds each saga
and world. The restored baseline and the cycle records stay.

**The reset discards every earlier change in the workspace, also Studio edits.** Make the edits
that you want to keep after the reset.

The cycle needs one reset. A second reset needs `--new-attempt`: the export stays current, and
`source-review` becomes stale.

## 9. Edit in the Studio and export the edited worlds

Phase C changes the content and captures the change. In the Studio at `http://localhost:4004`:

1. Edit the content of the worlds: Object Layers, maps, quests, actions. Each save of an Object
   Layer publishes a new definition with a new CID. A save never binds it.
2. Bind each item to the definition it must run in the **Cyberia Item Catalog** view. See
   [Manage runtime bindings](manage-runtime-bindings.md).

Then export each world that holds an edited item or document, and read the change:

```bash
node bin/cyberia instance snapshot <instance-code> --export --dev
git -C cyberia-content diff
```

The snapshot reads the workspace and writes a full copy of the world. Then it replaces
`src/content/instances/<code>/` with that copy, so a document that left the world leaves the source.
A failed snapshot leaves the directory as it was. A snapshot writes no other world, and never writes
`src/content/global/`.

Each item of the world is the definition that the catalog binds when the snapshot runs:

| Item in the workspace                          | Snapshot                             |
| ---------------------------------------------- | ------------------------------------ |
| Edited, not bound                              | The definition bound before the edit |
| Edited and bound                               | The new definition                   |
| Not changed                                    | The definition bound now             |
| Bound to a CID that no stored definition holds | The snapshot fails                   |

The catalog holds one binding per item for the whole release. After a binding change, export each
release world that holds the item. The snapshot names each item that release worlds bind to
different definitions. `source-review` and a release build refuse that source.

This cycle exports global content from the baseline only. A Studio edit of an item that no release
world holds does not reach the source.

The diff shows only your changes against the baseline revision. Do not run the export of step 7
again after the snapshots: it writes the baseline over your changes.

## 10. Review and release the source

Phase D reviews and releases the source. On the workstation, review the diff, run the tests of `cyberia-content` (`npm test`) and commit the
reviewed change. Then, with the share still open:

```bash
node bin/cyberia content lifecycle verify source-review --cycle <cycle-id>
node bin/cyberia release build --commit --cycle <cycle-id>
node bin/cyberia release lock --commit --cycle <cycle-id>
node bin/cyberia release publish --private --cycle <cycle-id>
node bin/cyberia content lifecycle verify source-release --cycle <cycle-id>
```

`source-review` checks that `cyberia-content` holds no uncommitted change, and that the release
worlds bind each item to one definition. It keeps the reviewed revision. `source-release` checks
that the deployment lock pins that revision, that the lock is committed, and that the `origin` of
`cyberia-deployment` holds the lock commit. `release publish` sets that `origin` to the repository
it pushes to. A new commit in `cyberia-content` after this makes the source stages stale: verify
`source-review` again.

## 11. Deploy and verify on the control node

The active release still serves live changes that its build does not hold, so a deploy stops
before the rollout. The changes are now source: name the active release and say why.
`content lifecycle plan` prints this command with the release that the baseline captured.
`deploy/dd-cyberia/content-release.sh status` names the active release.

```bash
RUN_QUIET_DEBUG=1 \
DISCARD_LIVE_CHANGES=<active-release-id> \
DISCARD_REASON="exported in cycle <cycle-id>" \
./deploy/dd-cyberia/sync-deploy.sh
node bin/cyberia content lifecycle verify production-deploy --cycle <cycle-id> \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
node bin/cyberia content lifecycle verify runtime-verify --cycle <cycle-id> \
  --env-path ./engine-private/conf/dd-cyberia/.env.production
```

`RUN_QUIET_DEBUG=1` prints every line of the deploy. The reason must not contain quotes, `$`,
backticks or backslashes. `runtime-verify` waits for every ready game server to report the new
release: run it again until it passes. Then the cycle is `completed`. See
[Deploy a Cyberia release](deploy-a-release.md) for the stages of the deploy.

## Run the control node stages in one command

Prepare the control node first ([step 1](#1-prepare-the-control-node)). Then run:

```bash
CYCLE_INSTANCES=test,amethyst-strata-expansion WORKSTATION_PEER_ID=<workstation-peer-id> \
  ./deploy/dd-cyberia/content-lifecycle.sh start
```

`start` does these steps in sequence:

1. It cancels each cycle of `dd-cyberia` that is not completed or cancelled. The journal keeps each
   cycle with the reason.
2. It removes the baselines that retention no longer keeps (`content baseline prune`).
3. It starts a cycle. Then it runs steps 2 to 4: preflight, infrastructure backup, capture and
   baseline verification.
4. It prints the handoff.
5. With `WORKSTATION_PEER_ID`, it opens the share until Ctrl+C ([step 5](#5-connect-the-workstation)).

Do not run `start` while a workstation works on an open cycle: `start` cancels that cycle. Use
`resume` for it.

The script writes the share value to the terminal only, never to its output. A log of the run, for
example `| tee debug.log`, does not hold it. Without a terminal, `WORKSTATION_PEER_ID` refuses
before any stage runs.

When a stage fails, the script stops and prints the command that continues the cycle:

```bash
./deploy/dd-cyberia/content-lifecycle.sh resume <cycle-id>
```

`resume` reads the plan of the cycle and runs the control node stages from the first stage that is
not complete. When all of them are complete, it prints the handoff and opens the share again. Use
it also when a share expired.

| Variable                                                      | Value                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `CYCLE_INSTANCES`, `CYCLE_SAGAS`, `CYCLE_MAPS`, `CYCLE_ITEMS` | The scope of a new cycle, as comma-separated codes        |
| `WORKSTATION_PEER_ID`                                         | The workstation peer of the share. Empty: no share        |
| `SHARE_HOURS`                                                 | The life of the share. Empty: the default of `share`      |
| `RUN_QUIET_DEBUG=1`                                           | Print every line of each stage, as for the deploy scripts |

## Follow a cycle

```bash
node bin/cyberia content lifecycle list
node bin/cyberia content lifecycle plan <cycle-id>
node bin/cyberia content lifecycle inspect <cycle-id> --events 20
```

On the control node, add `--env-path` as in step 1. A command that stops part way is safe to run
again with the same `--cycle`.

`plan`, the handoff and the Studio list the commands of the next stage that already ran as done,
and only the rest as commands. A command that records an operation, such as `release build`, `lock`
and `publish`, counts once that operation succeeded after the stage before it and after the command
before it. A new `release build` makes `lock` and `publish` run again.

To stop a cycle:

```bash
node bin/cyberia content lifecycle cancel <cycle-id> --reason "the release moved to the next cycle"
```

The Studio of the production deployment shows the same cycles and journals under **Cyberia Content
Lifecycle**. On a workstation, export `CYBERIA_LIFECYCLE_SHARE` before `npm run dev dd-cyberia`: the
Studio at `localhost:4004` then shows the shared cycle, read by the engine through the share, and the
Development Sandbox of the workstation apart from it. Without the variable, the Studio of a
workstation shows its development database, which holds rehearsal cycles only, and says so.

## Troubleshooting

A command that exits `3` was blocked: a precondition refused it before it changed anything.

| Message                                                  | Action                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Cannot find package 'pngjs'`                            | Run `npm install` after `cmt --switch-repo`                                                        |
| `<deploy-id> (<host>) holds no content lifecycle`        | Name the Cyberia deploy with `--env-path` ([step 1](#1-prepare-the-control-node))                  |
| `No MongoDB primary answers in namespace <namespace>`    | Run on the control node, or connect this workstation ([step 5](#5-connect-the-workstation))        |
| `No content lifecycle <cycle-id> in the development …`   | Run `share` and set `CYBERIA_LIFECYCLE_SHARE` ([step 5](#5-connect-the-workstation))               |
| `… is not the MongoDB of a Development Sandbox session`  | Start the sandbox ([step 6](#6-start-the-development-sandbox))                                     |
| `In use by another process: MongoDB 127.0.0.1:27017`     | Stop that process, often a forward to production; never write through it                           |
| `The kubeconfig context is <x>, not the sandbox`         | Run the command through `node bin sandbox up`, which pins the sandbox context                      |
| `… is complete for sandbox:<peer>/kind …`                | The stage ran for this sandbox already; add `--new-attempt` to run it again                        |
| `Commit or discard these changes before the export …`    | Commit the export of [step 7](#7-export-the-baseline-on-the-workstation), then run it again        |
| `… does not hold the live export of this cycle …`        | Commit the export of step 7 as it is, build the artifact, then reset                               |
| `The content artifact is not the build of …`             | Build the artifact: `(cd cyberia-content && node bin/cyberia-content.js build)`                    |
| `The release instances bind one item to different …`     | Export each world the message names ([step 9](#9-edit-in-the-studio-and-export-the-edited-worlds)) |
| `… started under an earlier stage order`                 | Cancel the cycle and start a new one: it is `superseded`                                           |
| `The share is expired` or `revoked`                      | Ask the control node for a new share                                                               |
| `Target <id> is not a sandbox of peer <peer-id>`         | Run the command on the workstation of the share                                                    |
| `The share at <address> does not answer`                 | Check the tunnel with `node bin wireguard --check`, and that `share` still runs                    |
| `Only peer <peer-id> … may use this share`               | Run the command on the workstation that `share` names, or share with its `--peer-id`               |
| `No workstation is enrolled on hub <hub>`                | Enroll the workstation ([step 5](#5-connect-the-workstation))                                      |
| `… runs where the cycles are, on the control node`       | Run `start`, `list` and `cancel` on the control node                                               |
| `Refused: the target is replica set …`                   | The development database is production: stop that forward and start the sandbox                    |
| `<stage> needs a host that is <context>`                 | Run the stage on the host that `handoff` names, with `--dev` for a development stage               |
| `… needs a host that takes part in it`                   | Run the operation on the control node or the workstation of the cycle                              |
| `<stage> waits for Preflight (preflight): it is pending` | Run `content lifecycle doctor <cycle-id>`                                                          |
| `No backup of dd-cyberia since the cycle started`        | Back up again, or name the earlier backup with `--backup <backup-id>`                              |
| `<id> is not the baseline of cycle <cycle-id>`           | Name the baseline id the capture printed, not the dbHash, or name no id                            |
| `DISCARD_LIVE_CHANGES needs DISCARD_REASON`              | Set a reason with no quotes, `$`, backticks or backslashes                                         |
