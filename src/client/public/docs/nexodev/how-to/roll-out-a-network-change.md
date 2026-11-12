# Roll out a network change

A network change is a change to what the fleet nodes run for the network: the WireGuard and HAProxy
code, the topology, a node document or an SSH account. This guide brings every fleet node to one
revision, in an order that keeps the tunnel up. Use it also to enroll a new machine.

## Rules

- **Run every step from the sync source.** The sync source is the machine that holds your engine
  and `engine-private` checkouts and the SSH keys of the fleet. `--sync` skips the machine it runs
  on.
- **Change the files on the sync source only.** `--sync` resets the checkout of each node, so a
  change that you make on a node is lost at the next sync.
- **Give each machine a unique hostname.** The hostname selects the node document
  `engine-private/deploy/nodes/<hostname>.json`. A new machine that keeps a default hostname, such as
  `localhost.localdomain`, takes the document of that name. Rename the new machine before it enrolls
  (`sudo hostnamectl set-hostname <name>`). Do not rename a Kubernetes node: its hostname is its
  Kubernetes node name.
- **Keep each node on its source pair.** `--repo-engine` selects the repository that a node runs:
  the engine, or the product source of a deploy, such as `engine-test-cyberia`. The private repository
  follows it: `engine-private`, or `engine-cyberia-private`. Read the pair of each node before the
  first sync (step 1), and give that node the same pair at each sync.
- **Give the hub the conf of each routed deploy.** `--haproxy-sync` routes each deploy in
  `dd.routes`, and it skips a deploy whose conf the checkout of the hub does not hold. A product
  private repository holds only its own deploy and the cron deploy.
- **Sync only fleet nodes.** The sync targets the roles that hold `fleet-member`: hub, control and
  worker. A workstation is never a target: its operator owns its checkout.

## What reaches a node, and how

| Change               | File on the sync source                       | Publish it with                                                            | Apply it with                              |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Network code         | `src/cli/wireguard.js`, `src/server/network/` | `git push` of the engine, or `node bin/build <deploy-id> --update-private` | `--sync`, then step 5 on the spokes        |
| Topology             | `engine-private/deploy/conf.wireguard.json`   | a commit and push of `engine-private`                                      | `--sync`, then step 5 on the spokes        |
| Node document        | `engine-private/deploy/nodes/<hostname>.json` | a commit and push of `engine-private`                                      | `--sync`                                   |
| SSH account          | `engine-private/deploy/conf.users.json`       | a commit and push of `engine-private`                                      | `--sync`, then `node bin ssh … --user-add` |
| Tunnel probe targets | the topology and `conf.event.json`            | the topology change                                                        | step 6 on the control node                 |

A sync of a product source also copies `engine-private/deploy` to the product private repository and
pushes it. `--update-private` runs the deploy test suites before it publishes the product source.

## Procedure

### 1. Prepare the change

```bash
node bin test --changed
git -C engine-private status --short
node bin wireguard --cmd 'git remote get-url origin,git -C engine-private remote get-url origin,git log -1 --oneline'
```

Commit the change in the engine and in `engine-private`. A node pulls from GitHub, so a commit that
you did not push does not reach it. The last command prints the source pair and the revision of each
fleet node.

Each fleet peer needs its node document in `engine-private/deploy/nodes`. The sync applies the
topology to the hub, and the hub restricts a peer that no document names.

### 2. Publish the source

```bash
# Fleet on the engine pair: push the engine and engine-private.
# Fleet on a product source, for example dd-cyberia:
node bin/build dd-cyberia --update-private
```

### 3. Preview and run the sync

Sync the nodes of one source pair in one run. For example, for the nodes on `engine-test-cyberia`:

```bash
node bin wireguard --sync --repo-engine underpostnet/engine-test-cyberia --nodes <node-names> --dry-run
node bin wireguard --sync --repo-engine underpostnet/engine-test-cyberia --nodes <node-names>
```

Without `--repo-engine`, the sync uses the engine pair. The preview prints each target node and its
steps, and changes nothing. The sync reaches each node over SSH and pulls, installs and reconciles
the services of its role. One failed node does not stop the others, and the command then exits
non-zero. To run one node again, add `--nodes <node-name>`.

On the hub, the sync also runs `--wireguard-setup`. Setup rewrites the interface file from the
topology, applies the peer filter and gives the running interface the peer table of the file. A new,
re-keyed or removed peer needs no restart, and the other tunnels stay up.

### 4. Check the hub

```bash
node bin wireguard --cmd 'node bin wireguard --status' --nodes vultr
```

Read `peerPolicies`. Each fleet peer must show `fleet`. A fleet peer that shows `restricted` has no
document in the checkout of the hub, and the hub drops all its traffic except the workstation port.
Add its document on the sync source and sync the hub again (`--nodes vultr`).

### 5. Reconcile the spokes and the routes

The sync does not change the tunnel of a spoke. When the change touches the hub key, the hub endpoint
or the tunnel network, run setup on each spoke:

```bash
node bin wireguard --cmd 'node bin wireguard --wireguard-setup --check --status' \
  --nodes localhost.localdomain,hp-envy-iso-ram-rocky9
```

When the setup of a spoke reports `restartRequired: true`, restart that spoke with
`--wireguard-restart --check`. A restart of the default peer stops the public sites for some seconds.

When the change touches the routes or the HAProxy code, publish the routes on the hub. The hub checks
the new config with `haproxy -c` before it reloads:

```bash
node bin wireguard --cmd 'node bin wireguard --haproxy-sync' --nodes vultr
```

When the hub setup reports `restartRequired: true`, the hub address or port changed. Restart the hub
at a quiet moment:

```bash
node bin wireguard --cmd 'node bin wireguard --wireguard-restart --check' --nodes vultr
```

A restart of the hub stops every tunnel for some seconds, and the public sites do not answer for that
time.

### 6. Reconcile the control plane

```bash
node bin wireguard --cmd 'node bin monitor --sync-prom,node bin event --list' --nodes localhost.localdomain
```

Do this after each topology change. Prometheus probes the peers of the previous topology until
`--sync-prom` runs. `event --list` must show a repair and a notify route for each event.

### 7. Verify

```bash
node bin wireguard --cmd 'node bin wireguard --check --status'
node bin wireguard --cmd 'ping -c1 10.0.0.1,ping -c1 10.0.0.3' --nodes localhost.localdomain
```

Each fleet node must report a fresh handshake. The second command checks traffic from the control
node to the hub and to another spoke. Then open one public site of each deploy.

## Enroll a new machine

Prepare the machine and record its peer and its node document on the sync source. Then run the
procedure above: the sync gives the running hub the new peer. Last, bring the tunnel up on the new
machine:

```bash
node bin wireguard --wireguard-setup --wireguard-start --check --status
```

[Workstation peers](run-the-edge-hub.md#workstation-peers) has the steps for a workstation.
[Node records](run-the-edge-hub.md#node-records) has the documents for the other roles.

## Recover

- **A node failed in step 3.** The last `[sync]` line names the step that stopped. Fix the cause and
  run the sync again with `--nodes <node-name>`. The steps are safe to run again.
- **A fleet peer lost its traffic after the sync.** Its document is missing on the hub. Add the
  document on the sync source and sync the hub again (`--nodes vultr`).
- **A new peer gets no handshake.** Read `--status` on the new machine. When `txBytes` grows and
  `rxBytes` stays `0`, the running hub does not hold its key: sync the hub again, or run
  `--wireguard-setup` there.
- **A wrong key reached the topology.** Restore `conf.wireguard.json` from the last good commit of
  `engine-private`, and run steps 1 to 5 again.
