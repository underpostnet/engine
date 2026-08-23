# Edge Hub WireGuard and HAProxy

Underpost exposes private cluster ingress through a static VPS. WireGuard carries traffic between the VPS hub and cluster nodes; HAProxy on the hub routes TCP `:80` and `:443`, while UDP `:443` and the optional SSH forwarding port go to the default peer.

## Table of Contents

1. [Configuration model](#configuration-model)
2. [Architecture](#architecture)
3. [Lifecycle](#lifecycle)
4. [Lifecycle and idempotency](#lifecycle-and-idempotency)
5. [Status](#status)
6. [Routing](#routing)
7. [Route resolution](#route-resolution)
8. [Generated host artifacts](#generated-host-artifacts)
9. [Adding a spoke without downtime](#adding-a-spoke-without-downtime)
10. [SSH forwarding and remediation credentials](#ssh-forwarding-and-remediation-credentials)
11. [Syncing the fleet](#syncing-the-fleet)
12. [Resyncing a node](#resyncing-a-node)
13. [Forward proxy](#forward-proxy)
14. [Response compression and egress](#response-compression-and-egress)
15. [Relationship to `underpost-ingress` and `underpost-gateway`](#relationship-to-underpost-ingress-and-underpost-gateway)
16. [Command reference](#command-reference)
17. [Verification](#verification)

---

## Configuration model

WireGuard uses three independent sources. None duplicates another.

| Source                                         | Scope      | Content                                                                                                |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `engine-private/deploy/conf.wireguard.json`    | deployment | Hubs keyed by static public IPv4, public keys, tunnel addresses, peer routing and management addresses |
| `engine-private/deploy/nodes/<node-name>.json` | deployment | Node role and its hub/peer association                                                                 |
| `engine-private/deploy/conf.users.json`        | deployment | SSH users, ports and key paths matched by management host                                              |

The topology never contains a current-machine role. Pulling `engine-private` onto another machine therefore cannot turn a control node into a hub.

Identity is the machine's own: a node document is named after the host it describes, so the hostname resolves it and nothing has to be selected. There is no host-local record of which node this is to install, pull, or drift out of date after a rename. The full hostname is matched first and its short name second, because an FQDN belongs to the resolver domain rather than to the node — `vultr.guest` and `vultr` are one host, and `vultr.json` serves both.

### Hub topology

The top-level key is the static public IPv4 used both as the WireGuard endpoint and the hub remediation address.

```json
{
  "64.176.25.136": {
    "interfaceName": "wg0",
    "listenPort": 51820,
    "address": "10.0.0.1/24",
    "publicKey": "<hub-public-key>",
    "sshForwardPort": 2222,
    "peers": [
      {
        "id": "homelab-a",
        "address": "10.0.0.2",
        "managementHost": "192.168.1.85",
        "publicKey": "<control-public-key>",
        "allowedIPs": ["10.0.0.2/32"],
        "hosts": [],
        "instances": [],
        "default": true
      },
      {
        "id": "homelab-a-hp-envy-iso-ram-rocky9",
        "address": "10.0.0.3",
        "managementHost": "192.168.1.191",
        "publicKey": "<worker-public-key>",
        "allowedIPs": ["10.0.0.3/32"],
        "hosts": [],
        "instances": [],
        "default": false
      }
    ]
  }
}
```

Private keys exist only at `/etc/wireguard/<interface>.key`. Generated configuration loads that file at interface startup and never renders private key material.

### Node records

The filename is the node name, so it is not repeated in the document.

`deploy/nodes/vultr.json`:

```json
{ "role": "hub", "hubHost": "64.176.25.136" }
```

`deploy/nodes/localhost.localdomain.json`:

```json
{ "role": "control", "hubHost": "64.176.25.136", "peerId": "homelab-a" }
```

`deploy/nodes/hp-envy-iso-ram-rocky9.json`:

```json
{ "role": "worker", "hubHost": "64.176.25.136", "peerId": "homelab-a-hp-envy-iso-ram-rocky9" }
```

Roles are exactly `hub`, `control`, and `worker`. A hub has no `peerId`; control and worker nodes must reference one peer in their selected hub.

### Node records for each machine

A machine whose document was already pulled with `engine-private` is ready — `node bin wireguard --status` reports it. To create or change a record, run `--node-config` from anywhere; `--node-name` defaults to the current hostname:

```bash
# VPS
node bin wireguard --node-config \
  --node-name vultr --node-role hub --hub-host 64.176.25.136

# Control plane
node bin wireguard --node-config \
  --node-name localhost.localdomain --node-role control \
  --hub-host 64.176.25.136 --peer-id homelab-a

# Worker
node bin wireguard --node-config \
  --node-name hp-envy-iso-ram-rocky9 --node-role worker \
  --hub-host 64.176.25.136 --peer-id homelab-a-hp-envy-iso-ram-rocky9
```

`--node-config` writes the tracked node document and nothing else. Runtime commands read `deploy/nodes/$(hostname).json` and join it with topology; a machine with no document of its own has no role, so the topology file pulled last cannot give it one.

---

## Architecture

```
                             PUBLIC INTERNET
                                    │
                        DNS / Hostname Resolution
                                    │
┌───────────────────────────────────▼─────────────────────────────────────┐
│                            EDGE HUB (VPS)                               │
│  Static public IPv4                                                     │
│                                                                         │
│  HAPROXY PUBLIC GATEWAY (generated from conf.server.json)               │
│    TCP :80   ─ Host header, per host ──► 10.0.0.x:80  (redirects, ACME) │
│    TCP :443  ─ SNI preread, per host ──► 10.0.0.x:443 (no TLS term.)    │
│    UDP :443  ─ DNAT, WHOLE PORT      ──► default spoke only (QUIC/H3)   │
│                                                                         │
│  FORWARD PROXY (outbound, opt-in)  10.0.0.1:1080, tunnel-bound only     │
│    HTTP + CONNECT from a spoke ──────► internet, from the VPS public IP │
│                                                                         │
│  WIREGUARD L3 TRANSPORT   wg0 │ 10.0.0.1/24 │ UDP 51820                 │
│    overlay routing table: 10.0.0.2 ─► 192.168.20.0/24, …                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │  encrypted tunnel, UDP 51820
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
       HOMELAB SPOKE A  10.0.0.2              HOMELAB SPOKE B  10.0.0.3
       PersistentKeepalive 25s                PersistentKeepalive 25s
       ┌──────────────────────────┐           ┌──────────────────────────┐
       │ K8S INGRESS  ★ TLS TERM. │           │ K8S INGRESS  ★ TLS TERM. │
       │ (underpost-ingress)      │           │ (underpost-ingress)      │
       └────────────┬─────────────┘           └────────────┬─────────────┘
         BARE-METAL KUBEADM CLUSTER             BARE-METAL KUBEADM CLUSTER
```

Why the split by port — the same reasoning `underpost-ingress` applies inside a node, one hop further out:

- **`TCP :80` is routed by `Host`, per hostname.** Plaintext carries a readable header, and the spoke's own ingress answers it with its redirect or content. ACME `http-01` rides this path unchanged.
- **`TCP :443` is passed through by SNI, per hostname.** Terminating here would mean holding every host's certificate and re-negotiating ALPN. Passing the bytes through keeps certificates, HTTP/2 and mTLS exactly where they already work.
- **`UDP :443` is forwarded whole, to one spoke — _not_ per hostname.** QUIC cannot be routed by hostname: `ssl_preread`-style inspection is TCP-only, and a QUIC Initial carries its SNI inside an encrypted frame. The **default** spoke receives every datagram on the port; a client that tries QUIC against another spoke's hostname gets no answer and falls back to TCP, which is routed correctly.

> The accurate model, which the implementation matches exactly:
>
> ```
> TCP :443 → SNI-based per-host routing
> TCP :80  → Host-based HTTP routing
> UDP :443 → whole-port forwarding to the default spoke
> ```
>
> Nothing in the edge splits UDP `:443` between spokes by hostname, and no configuration option turns that on.

---

## Lifecycle

### Author topology without touching a host

`--build-conf` changes only `conf.wireguard.json`. Supply `--hub-host` when more than one hub exists or no local identity is selected.

```bash
node bin wireguard --build-conf --hub-host 64.176.25.136 \
  --peer-add homelab-a --peer-ip 10.0.0.2 \
  --management-host 192.168.1.85 --public-key '<control-public-key>' --default

node bin wireguard --build-conf --hub-host 64.176.25.136 \
  --peer-add homelab-a-hp-envy-iso-ram-rocky9 --peer-ip 10.0.0.3 \
  --management-host 192.168.1.191 --public-key '<worker-public-key>'

node bin wireguard --build-conf
```

`allowedIPs` defaults to the peer tunnel `/32`. Add a LAN subnet only when the hub must route through that peer to additional machines. Never assign overlapping CIDRs to different peers.

### Configure the hub

```bash
node bin wireguard --node-config --node-name vultr
node bin wireguard \
  --wireguard-install --wireguard-setup --cidr 10.0.0.1/24 \
  --wireguard-start --haproxy-setup --forward-proxy-server --status
```

Setup generates or reads the local key pair, updates the selected hub public key in topology, writes `/etc/wireguard/wg0.conf`, and applies hub firewall rules.

During first bootstrap, configure the control node after starting the hub, then run `node bin wireguard --check --status` on the hub. Hub health requires a fresh handshake with the default routing peer; an active `wg-quick` unit with every HAProxy backend down is not reported as healthy.

### Configure control and worker nodes

```bash
node bin wireguard --node-config --node-name localhost.localdomain
node bin wireguard --wireguard-install --wireguard-setup --wireguard-start --check --status

node bin wireguard --node-config --node-name hp-envy-iso-ram-rocky9
node bin wireguard --wireguard-install --wireguard-setup --wireguard-start --check --status
```

The endpoint, tunnel address and hub public key are derived from the selected node and topology. Setup updates only that peer's public key; it cannot overwrite hub or another node identity.

### Reconcile after a pull

```bash
node bin wireguard --node-config --node-name "$(hostname)"
node bin wireguard --wireguard-setup --wireguard-restart --check --status
```

### Reset and re-key

```bash
node bin wireguard --wireguard-reset
node bin wireguard --wireguard-setup --wireguard-start --check

node bin wireguard --wireguard-reinstall --check --status
```

Reset removes generated host state but retains the key pair, topology and selected identity. Reinstall replaces the local key pair and updates either the hub key or the selected peer key.

---

## Lifecycle and idempotency

Every lifecycle command produces the same outcome regardless of the host's starting state:

- **Packages** are queried with `rpm -q` first; an already-provisioned host installs nothing.
- **Keys** are generated once and reused; a second `--wireguard-setup` reuses the existing pair.
- **Configs** are compared before writing, and HAProxy is reloaded only when something changed.
- **iptables** rules live in dedicated chains that are flushed and refilled on every apply — no accumulating near-duplicate rules, and no guessing what a previous run installed.
- **firewalld** rules are added with `--permanent`, which is already idempotent, and withdrawn from the _same_ rule list on reset, so the two directions cannot drift.
- **`--wireguard-setup` re-runs** inherit every value the registry recorded — role, address, listen port, and on a spoke the hub `endpoint` and `hubPublicKey` — so repeating the setup does not require repeating the flags that established it.
- **`--peer-add` re-runs** merge over the stored entry: flags you pass are updated, flags you omit keep their value. Re-registering a spoke under the same id with a new key withdraws the old key from the live interface first.

### Idempotent on disk is not idempotent in memory

The one place repetition is _not_ enough, and the reason the restart section above exists:

| Artifact                                | Converges on re-run? |                                                    |
| --------------------------------------- | -------------------- | -------------------------------------------------- |
| Files under `/etc`                      | ✅                   | compared byte-for-byte before writing              |
| Registry                                | ✅                   | normalized and compared before writing             |
| Packages, keys, sysctl, firewalld       | ✅                   | queried or `--permanent`, never blindly re-applied |
| NAT chains                              | ✅                   | flushed and refilled every apply                   |
| Peer table on the **live** interface    | ✅                   | `wg set` adds, updates and withdraws in place      |
| The **running** `wg-quick@<iface>` unit | ❌                   | reads its config only at start                     |

A changed interface config under a live unit is the single divergence the module cannot close on its own, because closing it means dropping every tunnel. `--wireguard-setup` detects it and says so rather than reporting a success that has not taken effect:

```
info  WireGuard interface configured   { …, restartRequired: true }
warn  Interface config changed while the tunnel is up; the live interface still runs the old one
      apply: --wireguard-stop --wireguard-start --interface wg0
```

Everything else — peer add, peer remove, route publication — applies to the running system in the same pass that persists it, which is why adding a spoke needs no restart at all.

`--wireguard-reset` deliberately **keeps** the key pair and the registry: destroying the key invalidates every spoke's peer entry, and a reset is for reconfiguring an edge, not for re-establishing trust with all of them. Re-keying is what `--wireguard-reinstall` is for.

Use `--dry-run` on any of them to see the exact files and commands first.

---

## Status

```bash
node bin wireguard --status
```

Every report starts with `nodeName`, `role`, `hubHost`, and `peerId`. On the hub, `peers` contains live handshake, endpoint and transfer information. On control and worker nodes, `hub` contains the one live WireGuard peer and `topologyPeers` is the deployment inventory. This separation prevents a spoke from reporting the hub as unregistered or other spokes as locally offline.

`unregisteredPeers` compares the live interface with the correct expected identities: all peer keys on the hub, and only the hub key elsewhere.

## Routing

HAProxy runs only on the selected `hub` role.

```bash
node bin wireguard --haproxy-sync
node bin wireguard --haproxy-setup
```

Bindings resolve in this order:

1. `hosts`: explicit hostname.
2. `instances`: deployment instance or template id.
3. `default`: unmatched TCP traffic, UDP `:443`, and optional SSH forwarding.

With only one peer, that peer is the implicit default. With multiple peers, select one explicitly with `--default`.

---

## Route resolution

Routing is derived, never hand-written. `--haproxy-sync` reads the deploy's own configuration and resolves every published hostname to a spoke.

0. **Deploy expansion** — the default `dd` reads `engine-private/deploy/dd.router` through the same helper every other runner uses, so the edge routes exactly the set the cluster deploys. A listed deploy whose private conf is not checked out locally is skipped with a warning rather than failing the run.
1. **Domain extraction** — top-level keys of each deploy's `conf.server.json`, plus every `conf.instances.json` host (all variants of a family included).
2. **Proxy filter** — a hostname is published only when one of its sub-paths declares a `proxy` array. Ports are unioned across sub-paths, because the edge routes a hostname, not a path.
3. **Peer resolution**, most specific first. Three bindings, and one derived hop:

   ```
   host → instance → redirect → default
   ```

   | Order | Match                                                    | Example                               |
   | ----- | -------------------------------------------------------- | ------------------------------------- |
   | 1     | `peer.hosts` contains the hostname                       | `"hosts": ["www.nexodev.org"]`        |
   | 2     | `peer.instances` contains the instance id or template id | `"instances": ["mmo-server"]`         |
   | 3     | the hostname its `redirect` points at resolves           | `dogmadual.com` → `www.dogmadual.com` |
   | 4     | the peer marked `"default": true`, or a lone peer        | —                                     |

   A peer with no `hosts` and no `instances` claims nothing at steps 1–2. It answers everything only while it is the sole peer, via the lone-peer fallback in step 4.

   `redirect` is not a fourth binding — it is derived from `conf.server.json`, not written in the registry. It exists because a redirect host publishes nothing of its own: `dogmadual.com` only says "go to `www.dogmadual.com`", and the spoke that answers the target has to answer the redirect too. Redirect chains are cycle-guarded, and a redirect only inherits a _specific_ match — never the target's fallback.

4. **Merge** — the per-deploy tables are unioned into the single table the edge publishes, each route carrying the deploy that contributed it. This step is not optional: the edge holds **one** pair of map files, so compiling a single deploy alone would overwrite them and take every other deploy's hostname off the internet. A hostname two deploys both claim is reported as a conflict; the first is served, deterministically.
5. **Compilation** — one line per hostname and transport into the map files.

A hostname that resolves to nothing is **reported**, not dropped: a silently missing route is a hostname that answers nothing at all, which is invisible until someone reports the outage. Use `--status` to see the resolved table before publishing it.

---

---

## Generated host artifacts

```
/etc/wireguard/<iface>.conf              interface + peer table          0600
/etc/wireguard/<iface>.key               private key                     0600
/etc/wireguard/<iface>.pub               public key                      0644
/etc/haproxy/haproxy.cfg                 generated edge gateway
/etc/haproxy/domain2backend.map          SNI  -> be_tls_<peer>
/etc/haproxy/domain2backend-http.map     Host -> be_http_<peer>
/etc/sysctl.d/99-underpost-wireguard.conf  net.ipv4.ip_forward=1  (both roles)
/etc/systemd/system/underpost-forward-proxy.service  forward proxy unit   0600
engine-private/deploy/conf.wireguard.json  peer registry (public keys only)
iptables nat chains UNDERPOST_WG_PRE / UNDERPOST_WG_POST   QUIC DNAT
firewalld permanent rules             80,443/tcp 443,51820/udp masquerade (hub)
                                      rich rule 1080/tcp from 10.0.0.0/24   (hub)
                                      zone=trusted interface=<iface>        (spoke)
```

All of these are outputs. Editing them by hand is overwritten by the next sync — change `conf.wireguard.json` or the deploy's `conf.server.json` instead.

`--wireguard-reset` removes every one of them except the key pair and the registry — see [Restart, reconnect, reset](#restart-reconnect-reset).

There is no `bind … ssl` line anywhere in the generated `haproxy.cfg`, and that absence is the design.

---

---

## Adding a spoke without downtime

`--peer-add` installs the peer on the live interface with `wg set`, so established tunnels keep their sessions, and rewrites the interface config in the same pass so the peer survives a restart. `--haproxy-sync` then validates the candidate config with `haproxy -c` **before** signalling the running process, and restores the previous files if it fails — a config that does not parse would otherwise take the whole edge down on reload.

The reload itself hands the listening sockets to the incoming process (`expose-fd listeners`), so no connection is refused while the routes change.

```bash
node bin wireguard \
  --peer-add homelab-c --peer-ip 10.0.0.4 --public-key '<key>' --hosts www.giancarlobertini.com
node bin wireguard --haproxy-sync
```

---

## SSH forwarding and remediation credentials

`sshForwardPort` publishes the default peer's SSH service through the hub. It is not the VPS management port. If `2222` forwards to `10.0.0.2:22`, hub remediation must use the VPS's actual `sshd` port instead.

```bash
# On the VPS
sudo sshd -T | awk '$1 == "port" {print $2}'

# On the control plane
node bin ssh --user root --host 64.176.25.136 --port '<vps-sshd-port>' --user-add
node bin ssh --user admin --host 192.168.1.85 --port 22 --user-add
node bin ssh --user admin --host 192.168.1.191 --port 22 --user-add
```

Event remediation joins the topology management address to `conf.users.json` exactly: the matched host is what supplies the account, port and key path. A named host with no registered connection is refused rather than falling back to whatever `DEFAULT_SSH_*` was last set to — an ambient credential would repair a different machine than the one that failed. Credentials and key paths never enter WireGuard topology, node records, monitoring ConfigMaps, or logs.

Whether a peer is _this_ machine is settled the same way: its `managementHost` has to be one of this host's own interface addresses. A node document is named after a hostname, and a default one like `localhost.localdomain` names every machine that kept it, so concluding locality from the document would run a repair — or a checkout switch — on whichever host loaded the config rather than on the peer. An address that cannot be matched is treated as remote, so the check only ever fails towards SSH.

Commands are logged with any credential in a URL masked to `***`, and the error a failed command throws carries the same masking, so a token cannot reach a terminal or a CI log through them.

The same registered accounts are what `node bin event <event-id> --e2e-test` uses to take a subject down before repairing it, so an account that can break a peer but not repair it fails the rehearsal instead of an outage. See [Observability and Events](<./Observability and Events.md>).

## Host metrics outside the cluster

```bash
node bin wireguard --node-exporter
node bin wireguard --node-exporter --nodes vultr
node bin wireguard --node-exporter --dry-run
```

A cluster node reports CPU, memory, disk and interface counters through the `node-exporter` DaemonSet. The hub is a VPS the cluster cannot schedule onto, so it runs the same collector as the `underpost-node-exporter` systemd service, installed over the SSH identity `--sync` uses and selected by the same `--nodes`. Only hubs are provisioned: a second collector on a cluster node would bind the port its pod already holds.

The service listens on the node's tunnel address alone, which is where Prometheus already scrapes it (`node-exporter-hub`), so the counters never reach the public address. It is bound to `wg-quick@<interface>` and reads the same textfile directory the Vultr bandwidth guard writes to, so the hub's quota rides in with the rest of its metrics. Re-running is convergent: the pinned binary is downloaded only when the host is not already running that version, and the run fails if the service does not come up.

## Syncing the fleet

```bash
node bin wireguard --sync
node bin wireguard --sync --nodes vultr,hp-envy-iso-ram-rocky9
node bin wireguard --sync --repo-engine underpostnet/engine
node bin wireguard --sync --repo-engine https://github.com/underpostnet/engine.git
node bin wireguard --sync --dry-run
```

The nodes a fault can be repaired on are exactly the nodes the engine runs on, so `--sync` reaches them through the same registries and SSH identities event remediation resolves — hubs through their external endpoint, the selected control node locally, workers over LAN SSH. A second host list would be free to disagree with the one that gets repaired.

Per node, in the checkout at `/home/dd/engine`, as **one** SSH session:

```bash
underpost run clean .
underpost run clean ./engine-private
underpost cmt --switch-repo <repo-engine> --target-branch <default-branch>
underpost pull ./engine-private <account>/engine-private
npm run fix
npm install
```

A node is reached once, not once per step: each session re-reads the credential store, re-authenticates and re-enters the checkout, and a step could otherwise land on a different session than the one before it. The steps are chained with `&&`, and each echoes a `[sync]` line first, so the last one printed names the step a failed run stopped at.

The engine's default branch is resolved **on the controller** and named explicitly. The node is about to replace its own checkout, so asking it to work that out would depend on the very tooling and credentials the step exists to renew — and a wrong guess fetches a ref that does not exist after `origin` has already been repointed. Resolution reads the cron deploy environment, because the engine repositories are private.

`--repo-engine` takes `owner/repo` or a clone URL and defaults to the configured account's `engine`; `engine-private` follows `GITHUB_USERNAME`, because the two are one checkout on the node. The engine step switches the remote rather than pulling into whatever it already tracked, so pointing a fleet at a fork is the same command as keeping it on the current one.

The sequence halts at the first failing step the later ones depend on — installing over a checkout whose pull failed would deploy stale sources under a fresh version. `npm run fix` is the one exception: `npm audit` exits non-zero while any advisory remains, which is a finding to report rather than a reason to skip the install. One node failing never stops the others; each is reported with the identity it ran as, and the command exits non-zero if any failed.

---

## Resyncing a node

Every node's state comes from four files, and each one has exactly one command that reapplies it. Nothing here is destructive; all of it is idempotent.

| Source | Reapplied by | Where it runs |
| --- | --- | --- |
| `deploy/nodes/<hostname>.json` | `node bin wireguard --node-config` | the node itself |
| `conf.wireguard.json` | `node bin wireguard --wireguard-setup --wireguard-restart` | the node itself |
| `conf.users.json` | `node bin ssh --user <u> --host <h> --user-add` | the control plane |
| `conf.event.json` | `node bin monitor --sync-prom` | the control plane |

A full fleet reconcile, in dependency order:

```bash
# 1. Hub — interface, routing, and the firewall zone its forwarding depends on
node bin wireguard --wireguard-setup --wireguard-restart --haproxy-sync

# 2. Each spoke — control plane and workers
node bin wireguard --wireguard-setup --wireguard-restart

# 3. Control plane — probes, rules, routes and notification gates
node bin monitor --sync-prom
node bin event --list          # every repair and notify route must resolve
node bin event wireguard-spoke-down --e2e-test --dry-run=false
```

`--wireguard-setup` rewrites the interface from topology and reapplies the host rules, including placing the tunnel interface in the `trusted` firewalld zone. **That zone is what makes spoke-to-spoke traffic work at all**: firewalld's forward chain ends in `reject with icmpx admin-prohibited`, so an unzoned `wg0` has its *forwarded* packets dropped while the hub still answers on its own tunnel address. The symptom is a tunnel that passes every health check while one spoke cannot reach another — and it is what the `wireguard-spoke-down` probe measures.

Verify the property directly, from the control plane:

```bash
ping -c1 10.0.0.1    # the hub
ping -c1 10.0.0.3    # another spoke — this is the one the zone governs
```

Step 3 is not optional after a topology change: probe targets are rendered from `conf.wireguard.json` when the monitoring config is generated, so until `--sync-prom` runs, Prometheus is still probing the previous set.

---

## Forward proxy

The authenticated HTTP/CONNECT proxy runs only on the hub tunnel address. Configure `FORWARD_PROXY_API_KEY`, then reconcile it:

```bash
node bin wireguard --forward-proxy-server
systemctl status underpost-forward-proxy
journalctl -u underpost-forward-proxy -n 50 --no-pager
```

Its firewalld rule admits only the configured tunnel subnet. `--wireguard-reset` removes the unit and firewall rule.

---

## Response compression and egress

Egress is metered at the VPS, so a byte reaching a client is a byte billed. The thing to understand before tuning anything is **where a response body can still be compressed** — and the answer follows directly from the port split above.

The `:443` path is encrypted end to end from the client to the cluster's own ingress. HAProxy reads the SNI without decrypting, `underpost-ingress` forwards the stream with `ssl_preread`, and the tunnel carries ciphertext. **Nothing on that path can compress anything**, because nothing on it can see a body. Compression has to happen at or behind TLS termination, and what leaves through the tunnel is then whatever that produced — the data plane re-encrypts the body it was handed, it does not re-encode it.

| Hop                                     | Sees a body?                 | Compresses                                   |
| --------------------------------------- | ---------------------------- | -------------------------------------------- |
| HAProxy `fe_https` (`:443` TCP)         | No — SNI preread only        | —                                            |
| HAProxy `fe_http` (`:80` HTTP)          | Yes                          | Not enabled; carries redirects and ACME only |
| `underpost-ingress` `:443` / `:443/udp` | No — L4 passthrough and DNAT | —                                            |
| `underpost-ingress` `:80`               | Yes                          | gzip (brotli when declared)                  |
| `underpost-gateway`                     | Yes                          | gzip + `gzip_static` (brotli when declared)  |
| Application runtime (API paths)         | Yes                          | Express `compression` middleware             |

`underpost-gateway` is where nearly all of it is recovered. Every host that declares a status page is routed through it for its whole site path — not only for the intercepted documents — so the HTML, CSS and JS of those hosts already pass through the one hop that holds them in the clear. API sub-paths are routed straight to the workload and are compressed by the runtime instead.

Both Nginx configs are rendered from one policy in `src/server/underpost-compression.js`: `gzip_vary` is always on, `gzip_proxied any` is set (Nginx's default of `off` would otherwise skip exactly the proxied responses these workloads forward), and the type list excludes already-compressed media, along with `text/html`, which Nginx compresses whether it is listed or not.

Three environment variables control it, read wherever the manifests are rendered:

| Variable                         | Default        | Effect                                                               |
| -------------------------------- | -------------- | -------------------------------------------------------------------- |
| `UNDERPOST_NGINX_COMPRESSION`    | on             | `off` / `0` / `false` / `no` renders no compression directive at all |
| `UNDERPOST_NGINX_IMAGE`          | `nginx:alpine` | Image for both Nginx workloads                                       |
| `UNDERPOST_NGINX_BROTLI_MODULES` | unset          | Directory holding `ngx_http_brotli_*_module.so`                      |

**Brotli is off unless you supply an image that carries it.** It is not part of the stock Nginx build — `gzip_static` is, brotli is not — and `brotli on;` in an image without the module is an unknown directive, which is a start-up failure rather than a degraded mode. On `underpost-ingress` that pod holds the node's 80/443, so the failure would be the whole edge. Setting `UNDERPOST_NGINX_BROTLI_MODULES` is the declaration that the image has them; it renders the `load_module` lines and the `brotli` directives together, and nothing without it.

To turn brotli on:

```bash
export UNDERPOST_NGINX_IMAGE=<registry>/nginx-brotli:<tag>
export UNDERPOST_NGINX_BROTLI_MODULES=/usr/lib/nginx/modules
```

then re-run the cluster and deploy commands that render the two workloads. The ingress path is safe by construction: the candidate config is validated with `nginx -t` inside the running pod before the live one is replaced, so a wrong module path fails the run and leaves the serving config untouched. The gateway rolls via its pod-template hash, so a wrong path surfaces as a failed rollout.

Verify what a client actually receives — the response headers, not the config:

```bash
curl -sI -H 'Accept-Encoding: gzip, br' https://<host>/ | grep -i 'content-encoding\|vary'
```

`Content-Encoding: gzip` (or `br`) with `Vary: Accept-Encoding` is the whole contract. A missing `Vary` is the one failure worth watching for, because a cache in front will hand a compressed body to a client that asked for none.

---

---

## Relationship to `underpost-ingress` and `underpost-gateway`

Three distinct layers, each one hop apart:

| Layer                           | Where               | Owns                                                                   |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `underpost wireguard` / HAProxy | Edge VPS            | Public listener; SNI/Host routing across the L3 tunnel to a cluster    |
| `underpost-ingress`             | Each cluster's node | The node's 80/443; hands each connection to Contour or Envoy Gateway   |
| `underpost-gateway`             | Inside the cluster  | Status pages, intercepted contexts; a backend the data planes route to |

TLS is terminated exactly once, at the cluster's own ingress. See [Main cluster lifecycle commands](<./Main cluster lifecycle commands.md>) for the two inner layers.

## Command reference

| Option                                                           | Purpose                                                                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--node-config`                                                  | Write/select the current machine identity                                                                |
| `--node-name <name>`                                             | Tracked node document name                                                                               |
| `--node-role <role>`                                             | `control`, `worker`, or `hub`                                                                            |
| `--hub-host <ipv4>`                                              | Select a topology by static hub IPv4                                                                     |
| `--peer-id <id>`                                                 | Associate control/worker node with one topology peer                                                     |
| `--wireguard-install`                                            | Install host packages                                                                                    |
| `--wireguard-setup`                                              | Generate keys, update selected topology public key, and write host configuration                         |
| `--peer-add <id>` / `--peer-remove <id>`                         | Change one selected hub peer                                                                             |
| `--build-conf`                                                   | Change topology only; no host actions                                                                    |
| `--wireguard-start` / `--wireguard-stop` / `--wireguard-restart` | Control the local interface                                                                              |
| `--check`                                                        | Require an active interface and a fresh handshake with the hub's default peer or the selected node's hub |
| `--expected-role` / `--expected-id`                              | Guard remote remediation against the wrong node                                                          |
| `--status`                                                       | Report current identity, live link state, topology and routing                                           |
| `--haproxy-setup` / `--haproxy-sync`                             | Reconcile hub routing                                                                                    |
| `--forward-proxy-server`                                         | Reconcile the hub outbound proxy                                                                         |
| `--wireguard-reset` / `--wireguard-reinstall`                    | Remove host state or re-key it                                                                           |
| `--sync`                                                         | Bring every registered node's engine checkout up to date                                                 |
| `--node-exporter`                                                | Provision the host metrics collector as a systemd service on the selected hubs                           |
| `--nodes <names>`                                                | Comma-separated node documents `--sync` and `--node-exporter` act on                                     |
| `--repo-engine <repo>`                                           | Engine repository `--sync` switches to, as `owner/repo` or a clone URL                                   |

## Verification

```bash
node bin wireguard --status
sudo wg show wg0
systemctl is-enabled wg-quick@wg0
systemctl is-active wg-quick@wg0
```

On the hub also verify:

```bash
systemctl is-active haproxy
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
```
