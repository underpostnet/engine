# Edge Hub: WireGuard and HAProxy

Reference for `underpost wireguard` / `underpost haproxy` — the hub-and-spoke edge that publishes homelab Kubernetes clusters on the public internet without terminating TLS outside them.

Two layers, kept apart:

| Layer | Is | Knows about |
| ----- | -- | ----------- |
| **WireGuard** | L3 encrypted site-to-site transport | Interfaces, peers, routed networks |
| **HAProxy** | Public edge gateway | Hostnames, and which spoke serves each |

WireGuard carries packets. It is not a router of hostnames and never sees one. Every hostname decision is HAProxy's, taken from three routing bindings — `hosts`, `instances`, `default`.

---

## Table of Contents

1. [Why this exists](#why-this-exists)
2. [Architecture](#architecture)
3. [Command](#command)
4. [Peer registry (`conf.wireguard.json`)](#peer-registry-confwireguardjson)
5. [Route resolution](#route-resolution)
6. [Generated host artifacts](#generated-host-artifacts)
7. [Runbook: from a newly created Rocky Linux 9 VPS](#runbook-from-a-newly-created-rocky-linux-9-vps)
8. [Restart, reconnect, reset](#restart-reconnect-reset)
9. [Adding a spoke without downtime](#adding-a-spoke-without-downtime)
10. [Lifecycle and idempotency](#lifecycle-and-idempotency)
11. [Response compression and egress](#response-compression-and-egress)
12. [Relationship to `underpost-ingress` and `underpost-gateway`](#relationship-to-underpost-ingress-and-underpost-gateway)

---

## Why this exists

Homelab clusters sit behind dynamic ISP addresses, double-NAT and CGNAT, so nothing on the public internet can dial them. A cloud VPS with a static address holds the hostnames and every spoke keeps an outbound UDP session open to it — the only direction a CGNAT boundary lets a session start.

The alternative — a full reverse proxy terminating TLS on the VPS — spreads private keys across machines the cluster does not own, and adds certificate synchronisation to every renewal. This subsystem avoids both: the edge reads the SNI out of the ClientHello and forwards the still-encrypted stream, so **certificates and private keys never leave the cluster that issued them**.

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
- **`UDP :443` is forwarded whole, to one spoke — *not* per hostname.** QUIC cannot be routed by hostname: `ssl_preread`-style inspection is TCP-only, and a QUIC Initial carries its SNI inside an encrypted frame. The **default** spoke receives every datagram on the port; a client that tries QUIC against another spoke's hostname gets no answer and falls back to TCP, which is routed correctly.

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

## Command

**Command:** `underpost wireguard [options]`

`underpost haproxy` is the same subsystem under a second name — identical options and behaviour, because the transport and the gateway in front of it are configured from the same deploy state.

| Option | Type | Scope | Action |
| --- | --- | --- | --- |
| `--deploy-id <id>` | string | Optional | Deploys whose `conf.server.json` / `conf.instances.json` define the routes. One id or a comma-separated list. **Defaults to `dd`** — every deploy in `dd.router` — because the edge holds one pair of map files for the whole cluster. Pass it only to narrow the table deliberately. |
| `--interface <name>` | string | Optional | WireGuard interface (default `wg0`). |
| `--wireguard-install` | boolean | Optional | Installs `wireguard-tools`, `haproxy`, `iptables`; sets the SELinux boolean HAProxy needs to dial backends. |
| `--wireguard-setup` | boolean | Optional | Generates the key pair, builds the interface config, applies sysctl/firewalld rules. |
| `--server` | boolean | Conditional | Configures this node as the hub. |
| `--client` | boolean | Conditional | Configures this node as a spoke. |
| `--port <n>` | number | Optional | WireGuard UDP listen port (default `51820`). |
| `--cidr <cidr>` | string | Required with `--server` | Hub interface address with prefix (`10.0.0.1/24`). With `--client`, the overlay subnet routed back through the hub (default `10.0.0.0/24`). |
| `--peer-ip <ip>` | string | Required with `--client` / `--peer-add` | Tunnel address of the spoke. |
| `--endpoint <host:port>` | string | Required with `--client` | Hub address a spoke dials (`vps.example.com:51820`). |
| `--public-key <key>` | string | Conditional | Hub public key with `--client`; spoke public key with `--peer-add`. |
| `--peer-add <peer-id>` | string | Optional | Registers a spoke and applies it to the running hub. |
| `--peer-remove <peer-id>` | string | Optional | Removes a spoke from the registry and the running hub. |
| `--allowed-ips <cidrs>` | string | Optional | Comma-separated CIDRs routed to the spoke. **Defaults to the spoke's own `/32`, which is all the edge needs** — add LAN subnets only to reach machines *behind* the spoke. |
| `--hosts <hosts>` | string | Optional | **Routing binding.** Hostnames bound directly to the spoke. |
| `--instances <instances>` | string | Optional | **Routing binding.** `conf.instances.json` ids bound to the spoke. |
| `--default` | boolean | Optional | **Routing binding.** Marks the spoke as the catch-all for unmatched hostnames, and as the QUIC target. |
| `--haproxy-setup` | boolean | Optional | Installs HAProxy, publishes the routes, enables the daemon. |
| `--haproxy-sync` | boolean | Optional | Recompiles the maps from deploy config and hot-reloads HAProxy. |
| `--status` | boolean | Optional | **The one read-only command.** Prints the whole edge context; changes nothing. |
| `--build-conf` | boolean | Optional | Writes **only** the registry; touches no host state. Combine with `--wireguard-setup` / `--peer-add` / `--peer-remove` to author the topology off-box; alone it normalizes and validates the existing file. |
| `--wireguard-start` | boolean | Optional | Enables and starts `wg-quick@<interface>` and the QUIC forward. |
| `--wireguard-stop` | boolean | Optional | Tears the interface down and removes its transient packet rules. |
| `--wireguard-reset` | boolean | Optional | Removes generated configs and packet rules; **keeps** the key pair and registry. |
| `--wireguard-reinstall` | boolean | Optional | Full purge, package reinstall and re-key. Every spoke must re-register. |
| `--dry-run` | boolean | Optional | Prints the files and commands the run would apply, without touching the host. |

Flags are evaluated in lifecycle order — install, setup, peer changes, route publication, then daemon control, and `--status` last — so a whole bring-up fits in one invocation, still executes in the only order that works, and can report what it left behind.

### `--status` is the whole read-only surface

There is one information command, not one per kind of state. `--status` reports, in a single structure:

```
role                interface           tunnel address      public key
WireGuard state     HAProxy state       QUIC target
peers               bindings per peer   handshake age / rx / tx / link state
routing summary     resolved routes with the binding each matched
unresolved hostnames and cross-deploy conflicts, when there are any
```

```bash
node bin wireguard --status
```

Under `--build-conf` it skips the host probes — no `wg show`, no `systemctl` — and reports registry and routing alone, so it runs on a workstation with no interface to query.

---

## Peer registry (`conf.wireguard.json`)

Stored at `./engine-private/deploy/conf.wireguard.json`, beside `dd.router` and `dd.cron`.

**Cluster-wide, not per deploy.** The hub has one interface, one address and one peer table, and those are properties of the machine — a copy per deploy would be several records of one fact, free to disagree. `--deploy-id` selects which *hostnames* are routed across the tunnel, never which tunnel exists, which is why every lifecycle command runs without it.

```json
{
  "interfaceName": "wg0",
  "role": "server",
  "listenPort": 51820,
  "address": "10.0.0.1/24",
  "publicKey": "<hub public key>",
  "peers": [
    {
      "id": "homelab-a",
      "address": "10.0.0.2",
      "publicKey": "<spoke public key>",
      "allowedIPs": ["10.0.0.2/32", "192.168.10.0/24"],
      "hosts": ["www.dogmadual.com"],
      "instances": [],
      "default": true
    }
  ]
}
```

A peer carries exactly three routing bindings — `hosts`, `instances`, `default` — plus its transport fields. Any other key in a hand-edited file is not a binding the edge honours and is dropped on the next normalization.

**On a spoke the same file looks different**, because a spoke has no peer table — it has one hub it dials:

```json
{
  "interfaceName": "wg0",
  "role": "client",
  "listenPort": 51820,
  "address": "10.0.0.2",
  "endpoint": "203.0.113.10:51820",
  "hubPublicKey": "<hub public key>",
  "publicKey": "<this spoke's own public key>",
  "peers": []
}
```

`endpoint` and `hubPublicKey` are the pair that makes a spoke's setup repeatable: **which hub to dial, and which identity to expect there**. Both are recorded, so re-running `--wireguard-setup --client` — and `--wireguard-reinstall`, which ends in one — needs no flags at all. Pass `--public-key` only when the hub's identity actually changed.

> **Public keys only.** The private half is generated under `umask 077` directly into `/etc/wireguard/<iface>.key` (mode `0600`, root-owned) and is never read back into the CLI process. The generated interface config carries no `PrivateKey` line at all — it loads the key with `PostUp = wg set %i private-key …` — so no rendered config, dry-run print, diff or log line can ever carry it.

### `--allowed-ips` is optional

`allowedIPs` defaults to the peer's own `/32`, and **that default is sufficient for the edge to work**. HAProxy dials `10.0.0.2:443` and `10.0.0.2:80`; `10.0.0.2/32` is exactly the route that carries it. Omitting the flag is the normal case:

```bash
# Enough for a working spoke
node bin wireguard \
  --peer-add homelab-a --peer-ip 10.0.0.2 --public-key '<spoke-a key>'
```

```
AllowedIPs = 10.0.0.2/32        # what lands in /etc/wireguard/wg0.conf
```

Add CIDRs only when the hub must reach machines **behind** the spoke on its LAN — other worker nodes by LAN address, a NAS, a management interface. Publishing the cluster does not need it: `underpost-ingress` binds the host network on the spoke node, so it answers on the tunnel address itself.

> **Overlapping subnets break routing.** WireGuard resolves an outbound packet by longest-prefix match across *every* peer's `AllowedIPs`, so a CIDR two spokes both claim is not shared — one wins and the other silently never receives that traffic. Homelabs routinely sit on the same `192.168.1.0/24`, which makes this the likeliest way a multi-spoke registry breaks. `--peer-add` warns when it detects a contested CIDR (duplicate tunnel addresses included, since an address contributes its own `/32`).

A spoke routes its LAN only when the registry says so, so a mistyped entry cannot silently claim a subnet another spoke already answers for.

### It is authored, not generated

Unlike `conf.dd-*.js` — which is derived from `conf.server.json` and can always be rebuilt — **nothing can regenerate `conf.wireguard.json`**. The peer bindings and public keys exist in no other file. Delete it and every hostname becomes unresolved; the routes cannot be recovered from the deploy configs. Keep it in `engine-private` and treat it as source.

Three flags write it, always as a side effect of the work they do:

| Flag | Writes |
| ---- | ------ |
| `--wireguard-setup` | this machine's `interfaceName`, `role`, `listenPort`, `address`, `publicKey`, and on a spoke `endpoint` + `hubPublicKey` |
| `--peer-add` | one entry in `peers[]`, merged over any existing entry with that id |
| `--peer-remove` | drops one entry from `peers[]` |

Nothing else creates it. `--status` and `--haproxy-sync` only read, and a missing file reads as an empty registry rather than an error — which is why a fresh host works before the first `--wireguard-setup`. `--dry-run` suppresses the write entirely.

### Building the conf without touching the host

`--build-conf` writes the registry and nothing else — no key generation, no `/etc/wireguard`, no `sysctl`, no `firewalld`, no `iptables`, no `wg set`, no `systemctl`. It runs anywhere, including a workstation with no WireGuard installed:

```bash
# Author the whole topology off-box, then commit it to engine-private
node bin wireguard --build-conf --wireguard-setup --server --cidr 10.0.0.1/24

node bin wireguard --build-conf \
  --peer-add homelab-a --peer-ip 10.0.0.2 --public-key '<spoke-a key>' \
  --allowed-ips 10.0.0.2/32,192.168.10.0/24 --default

# Check what it resolves to before any machine exists
node bin wireguard --build-conf --status

# Alone: normalize and validate a hand-edited file
node bin wireguard --build-conf
```

`--build-conf` is a hard promise rather than a modifier: it short-circuits every host action, so a run that also carries `--haproxy-setup` or `--wireguard-start` still touches nothing.

The one field it leaves empty is this machine's own `publicKey`, because no key exists off-box. Running `--wireguard-setup` on the real host fills it in, keeps every peer already recorded, and applies them.

Use `--dry-run` when you want to change nothing at all — including the registry.

On a machine that has no registry yet, `--build-conf` with no authoring flags writes the empty skeleton and says so:

```
info  Registry normalized  { peers: [], role: '', changed: true }
warn  Registry has no peers: no hostname can resolve until at least one is registered
warn  Registry records no role for this machine
```

That is a valid starting point — a file to fill in — but it routes nothing. Two guards keep an empty registry from reaching production:

- `--status` warns **No hostname resolved to a spoke: the edge would refuse every request** instead of printing an empty table as if it were healthy.
- `--haproxy-sync` and `--haproxy-setup` **refuse to publish** a table with zero routes, before writing any file or touching any daemon. Publishing empty maps would answer `421` to every hostname on the box.

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

   | Order | Match | Example |
   | ----- | ----- | ------- |
   | 1 | `peer.hosts` contains the hostname | `"hosts": ["www.nexodev.org"]` |
   | 2 | `peer.instances` contains the instance id or template id | `"instances": ["mmo-server"]` |
   | 3 | the hostname its `redirect` points at resolves | `dogmadual.com` → `www.dogmadual.com` |
   | 4 | the peer marked `"default": true`, or a lone peer | — |

   A peer with no `hosts` and no `instances` claims nothing at steps 1–2. It answers everything only while it is the sole peer, via the lone-peer fallback in step 4.

   `redirect` is not a fourth binding — it is derived from `conf.server.json`, not written in the registry. It exists because a redirect host publishes nothing of its own: `dogmadual.com` only says "go to `www.dogmadual.com`", and the spoke that answers the target has to answer the redirect too. Redirect chains are cycle-guarded, and a redirect only inherits a *specific* match — never the target's fallback.

4. **Merge** — the per-deploy tables are unioned into the single table the edge publishes, each route carrying the deploy that contributed it. This step is not optional: the edge holds **one** pair of map files, so compiling a single deploy alone would overwrite them and take every other deploy's hostname off the internet. A hostname two deploys both claim is reported as a conflict; the first is served, deterministically.
5. **Compilation** — one line per hostname and transport into the map files.

A hostname that resolves to nothing is **reported**, not dropped: a silently missing route is a hostname that answers nothing at all, which is invisible until someone reports the outage. Use `--status` to see the resolved table before publishing it.

---

## Generated host artifacts

```
/etc/wireguard/<iface>.conf              interface + peer table          0600
/etc/wireguard/<iface>.key               private key                     0600
/etc/wireguard/<iface>.pub               public key                      0644
/etc/haproxy/haproxy.cfg                 generated edge gateway
/etc/haproxy/domain2backend.map          SNI  -> be_tls_<peer>
/etc/haproxy/domain2backend-http.map     Host -> be_http_<peer>
/etc/sysctl.d/99-underpost-wireguard.conf  net.ipv4.ip_forward=1  (hub only)
engine-private/deploy/conf.wireguard.json  peer registry (public keys only)
iptables nat chains UNDERPOST_WG_PRE / UNDERPOST_WG_POST   QUIC DNAT
firewalld permanent rules             80,443/tcp 443,51820/udp masquerade (hub)
                                      zone=trusted interface=<iface>        (spoke)
```

All of these are outputs. Editing them by hand is overwritten by the next sync — change `conf.wireguard.json` or the deploy's `conf.server.json` instead.

`--wireguard-reset` removes every one of them except the key pair and the registry — see [Restart, reconnect, reset](#restart-reconnect-reset).

There is no `bind … ssl` line anywhere in the generated `haproxy.cfg`, and that absence is the design.

---

## Runbook: from a newly created Rocky Linux 9 VPS

End to end, on a stock image with nothing configured. Every phase is idempotent — a phase that was already applied can be re-run without harm, so an interrupted bring-up resumes by repeating the phase it stopped in.

**Every command below is tagged with the machine it runs on.** The two roles never share a command:

| Tag | Machine | Role |
| --- | ------- | ---- |
| 🟦 **HUB** | the edge VPS, public static IP | WireGuard hub + HAProxy edge gateway |
| 🟩 **SPOKE** | each homelab Kubernetes control-plane | WireGuard client + the cluster that terminates TLS |
| ⬜ **ANY** | a workstation, or either of the above | read-only or registry-only; touches no host state |

A command run on the wrong machine is not silently wrong — `--server` and `--client` write different interface configs, and `--haproxy-*` only means anything where HAProxy holds the public ports.

### Phase 0 — What you need before you start

| Item | Example | Notes |
| ---- | ------- | ----- |
| Edge VPS | Rocky Linux 9, 1 vCPU / 1 GB is enough | Passthrough is cheap; no TLS work happens here |
| Static public IPv4 | `203.0.113.10` | The address every hostname's A record will point at |
| Provider firewall / security group | 80/tcp, 443/tcp, 443/udp, 51820/udp | **Opened separately from `firewalld`** — see Phase 1 |
| One or more homelab clusters | already running `underpost-ingress` | Each becomes a spoke |
| `engine-private` access | git credentials or a deploy key | Supplies `dd.router` and every `conf.server.json` |
| Tunnel address plan | hub `10.0.0.1`, spokes `10.0.0.2`, `10.0.0.3`, … | Inside `10.0.0.0/24` by default |

The edge is **not** a cluster node. Do not run `underpost cluster --init-host` on it — that installs Docker, CRI-O, kubeadm and Helm for a machine that runs neither pods nor a kubelet.

### Phase 1 — 🟦 HUB — First login on the new VPS

```bash
# Update the base image and set an identity
sudo dnf -y update
sudo hostnamectl set-hostname edge-hub-01
sudo timedatectl set-timezone UTC

# A non-root account with passwordless sudo. Every host mutation the CLI makes
# — dnf, install into /etc, iptables, systemctl — goes through sudo, so an
# account that prompts for a password will stall a non-interactive run.
sudo useradd -m -G wheel dd
sudo install -d -m 0700 -o dd -g dd /home/dd/.ssh
sudo cp ~/.ssh/authorized_keys /home/dd/.ssh/authorized_keys
sudo chown dd:dd /home/dd/.ssh/authorized_keys && sudo chmod 600 /home/dd/.ssh/authorized_keys
echo 'dd ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/dd
sudo chmod 440 /etc/sudoers.d/dd
```

Log back in as `dd` from here on.

**Firewalld is active on a stock Rocky 9 image**, and `--wireguard-setup` opens the ports it needs there automatically (80/tcp, 443/tcp, 443/udp, 51820/udp, masquerade). What it cannot reach is your **provider's** firewall — DigitalOcean cloud firewalls, Hetzner firewalls, AWS security groups, OVH edge rules. Open the same four ports there before Phase 3, or the tunnel will never complete a handshake and every diagnostic will look healthy from inside the box.

SELinux is enforcing by default and should stay that way: `--wireguard-install` sets the one boolean HAProxy needs (`haproxy_connect_any`) rather than asking you to disable it.

### Phase 2 — 🟦 HUB + 🟩 SPOKE — Node 24, engine, engine-private

> Run this on the **hub** and on **every spoke**. Both ends drive their own tunnel through the same CLI, from their own checkout.

```bash
sudo dnf -y install git curl

# Node 24 — the version the engine requires; the dnf module stream is older
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
node --version        # must report v24.x

# The engine and its private configuration
sudo mkdir -p /home/dd && sudo chown dd:dd /home/dd
git clone https://github.com/underpostnet/engine.git /home/dd/engine
cd /home/dd/engine
git clone https://github.com/<owner>/engine-private.git engine-private
npm install

# Optional: the repo's Rocky base package set (vim, rsync, tcpdump, chrony …)
node bin run host-update
```

Every command below is run from `/home/dd/engine`.

`engine-private` is what supplies `deploy/dd.router`, every `conf/<deploy-id>/conf.server.json`, and the peer registry the edge writes back. Without it the edge has no hostnames to route.

> **The peer registry is per-machine state.** Each host — hub and every spoke — keeps its own `engine-private/deploy/conf.wireguard.json` recording *that machine's* role, address and public key. Only the hub's copy drives routing. If you sync `engine-private` between machines, expect this file to differ per host: treat the hub's as authoritative and never propagate a spoke's copy over it.

### Phase 3 — 🟦 HUB — Bring up the hub tunnel

```bash
node bin wireguard \
  --wireguard-install --wireguard-setup --server --cidr 10.0.0.1/24 --wireguard-start
```

That single invocation installs the packages, generates the key pair, writes `/etc/wireguard/wg0.conf`, enables IP forwarding, opens firewalld, and enables `wg-quick@wg0` for reboot survival — in that order, because it is the only order that works.

Read back the hub public key the spokes will need:

```bash
node bin wireguard --status
```

Confirm the listener is actually bound before moving on:

```bash
sudo wg show wg0                      # interface exists, listening port 51820
ss -lunp | grep 51820                 # UDP socket is open
systemctl is-enabled wg-quick@wg0     # enabled
```

### Phase 4 — 🟩 SPOKE — Bring up each spoke

On every homelab control-plane, using the hub public key from Phase 3 and a distinct tunnel address per spoke:

```bash
node bin wireguard \
  --wireguard-install --wireguard-setup --client \
  --peer-ip 10.0.0.2 --endpoint 203.0.113.10:51820 --public-key '<hub public key>' \
  --wireguard-start

node bin wireguard --status   # this spoke's own public key
```

Nothing else is needed on the spoke. `underpost-ingress` already binds `0.0.0.0:80/443` on the host network, so it answers on `10.0.0.2` the moment the tunnel is up. `AllowedIPs` is the tunnel subnet alone, never `0.0.0.0/0` — the spoke publishes services through the hub, it does not route its own egress through it.

Collect each spoke's public key; Phase 5 needs them.

### Phase 5 — 🟦 HUB — Register the spokes and bind the deploys

Bindings decide which spoke answers which hostname. There are three, and only three:

| Binding | Flag | Matches |
| ------- | ---- | ------- |
| `hosts` | `--hosts` | An explicit hostname. Beats everything. |
| `instances` | `--instances` | A `conf.instances.json` id or template id, so a whole variant family binds with one name. |
| `default` | `--default` | Everything the first two did not claim, plus all of UDP :443. |

`--status` shows the hostnames and instance ids in play before you bind anything:

```bash
node bin wireguard --build-conf --status
```

Now pick a strategy.

#### Strategy A — one homelab: bind nothing (the default)

**If every deploy in `dd.router` runs on a single cluster, you do not write bindings at all.** Register the one spoke and it answers everything:

```bash
node bin wireguard \
  --peer-add homelab-a --peer-ip 10.0.0.2 --public-key '<spoke-a key>'
```

`--allowed-ips` is omitted deliberately: it defaults to `10.0.0.2/32`, which is the only route the edge needs. Add it only to reach machines behind the spoke's LAN.

All 26 hostnames from all five deploys route to it, reported as `via: default`. A lone peer is its own fallback, so `--default` is not even required.

This is the answer to "how do I use all of `dd.router` by default": **that is already the default.** Every run compiles every deploy unless `--deploy-id` narrows it, and with one spoke every hostname lands on it. Bindings only become necessary when there is more than one place a hostname could go.

> ### ⚠️ Empty flags do not mean "everything"
>
> Omitting `--hosts` and `--instances` does **not** make a peer claim all hostnames. It claims *nothing*. It serves everything only for as long as it is the **only** peer, because a lone peer is the implicit fallback.
>
> Registering a second peer removes that implicit fallback, and every hostname the bindings do not name goes unresolved in the same instant — and UDP :443 stops being forwarded at all, because there is no spoke to send it to:
>
> ```
> 1 bare peer                      ->  routes 26 | unresolved  0   {default: 26}   quic -> 10.0.0.2
> + 2nd peer, neither --default    ->  routes  0 | unresolved 26                   quic -> (none)
> mark one peer --default          ->  routes 26 | unresolved  0   {default: 26}   quic -> 10.0.0.2
> ```
>
> `--peer-add`, `--peer-remove` and `--status` warn the moment a registry holds two or more peers with no `--default` among them. **Set `--default` on one peer as soon as you have two**, or bind every hostname explicitly.

#### Strategy B — several homelabs: bind by hostname and instance

Name the hostnames and instances each spoke serves, and mark exactly one spoke `--default` to catch the rest:

```bash
# Spoke A: dd-core + dd-prototype, and everything unbound (dd-lampp, dd-test)
node bin wireguard \
  --peer-add homelab-a --peer-ip 10.0.0.2 --public-key '<spoke-a key>' \
  --allowed-ips 10.0.0.2/32,192.168.10.0/24 \
  --hosts www.dogmadual.com,www.nexodev.org,healthcare.nexodev.org,vitaintegral.nexodev.org,www.bymyelectrics.com,www.cecinasmarcelina.com \
  --default

# Spoke B: dd-cyberia, including its MMO instances
node bin wireguard \
  --peer-add homelab-b --peer-ip 10.0.0.3 --public-key '<spoke-b key>' \
  --allowed-ips 10.0.0.3/32,192.168.20.0/24 \
  --hosts www.underpost.net,www.cyberiaonline.com,cryptokoyn.net,itemledger.com \
  --instances mmo-server,mmo-client
```

Naming a template id (`mmo-server`) binds its whole variant family, so `mmo-server-forest` and `mmo-server-test` follow without being listed.

#### What the real config forces you to know

- **Bind the `www` host, not the bare domain.** A redirect host inherits its target's spoke: `giancarlobertini.com` → `www.giancarlobertini.com`, `cyberiaonline.com` → `www.cyberiaonline.com`. The redirect hop only inherits a *specific* match, so binding the target is what makes both resolve.
- **Instance hosts bind by id, everything else by hostname.** `--instances` is the one shorthand that covers several hostnames at once, because a template id names a whole variant family.
- **Exactly one peer should carry `--default`.** It catches every unbound hostname *and* receives all UDP :443, since QUIC cannot be routed by hostname. With no `--default` and more than one peer, UDP :443 is forwarded nowhere.

Bindings are edited by re-running `--peer-add` with the same id: flags you pass are updated, flags you omit keep their stored value.

### Phase 6 — 🟦 HUB — Publish the routes for every deploy

Inspect before you publish — `--status` changes nothing:

```bash
node bin wireguard --status
```

With the bindings above, all five deploys resolve cleanly — 26 hostnames, nothing unresolved, no conflicts:

```
"via": { "host": 10, "instance": 2, "redirect": 8, "default": 6 }

client.cyberiaonline.com -> homelab-b (instance, dd-cyberia)
cryptokoyn.net           -> homelab-b (host,     dd-cyberia)
cyberiaonline.com        -> homelab-b (redirect, dd-cyberia)
dogmadual.com            -> homelab-a (redirect, dd-core)
giancarlobertini.com     -> homelab-a (default,  dd-lampp)
healthcare.nexodev.org   -> homelab-a (host,     dd-prototype)
server.cyberiaonline.com -> homelab-b (instance, dd-cyberia)
test.nexodev.org         -> homelab-a (default,  dd-test)
www.dogmadual.com        -> homelab-a (host,     dd-core)
www.nexodev.org          -> homelab-a (host,     dd-core)
…
```

The parenthesised binding is how each hostname found its spoke. A row reading `default` for a host you meant to bind explicitly is a missing binding, not a working route — fix it now rather than after DNS moves.

Then publish:

```bash
node bin wireguard --haproxy-setup
```

Do not narrow this with `--deploy-id`. The edge holds **one** pair of map files, so publishing a single deploy would overwrite them and take the other four deploys' hostnames off the internet — which is exactly why the whole of `dd.router` is the default.

### Phase 7 — Verify before DNS

⬜ **From a machine outside the VPS** — override DNS so the real records stay untouched:

```bash
# TCP + TLS through the edge, terminated at the spoke
curl -sSI --resolve www.nexodev.org:443:203.0.113.10 https://www.nexodev.org

# The certificate must be the spoke's own — the edge holds none
openssl s_client -connect 203.0.113.10:443 -servername www.nexodev.org </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer

# Cleartext path (redirects and ACME)
curl -sSI --resolve www.nexodev.org:80:203.0.113.10 http://www.nexodev.org
```

🟦 **On the hub:**

```bash
node bin wireguard --status                            # every spoke online, recent handshake
sudo wc -l /etc/haproxy/domain2backend.map             # 26 with the config above
systemctl is-active haproxy wg-quick@wg0
sudo iptables -t nat -S UNDERPOST_WG_PRE               # QUIC DNAT to the default spoke
```

### Phase 8 — ⬜ Off-box — DNS cutover

Point every routed hostname's A record at the VPS public IPv4. Lower the TTL a day beforehand if you need a fast rollback.

TLS is unaffected by the cutover: cert-manager continues to issue and renew inside each cluster, and ACME `http-01` challenges reach it over the `:80` HTTP path. Nothing about certificates changes on the edge, because the edge has never held any.

### Day-2 operations

| Task | Command |
| ---- | ------- |
| A deploy's `conf.server.json` changed | `node bin wireguard --haproxy-sync` |
| Add a spoke | `--peer-add …` then `--haproxy-sync` (see below) |
| Retire a spoke | `--peer-remove <id>` then `--haproxy-sync` |
| Inspect anything read-only — routes, peers, link health, daemons | `node bin wireguard --status` |
| Author or repair the registry off-box | `node bin wireguard --build-conf …` |
| Preview any of the above | append `--dry-run` |

### Troubleshooting

| Symptom | Likely cause | Check |
| ------- | ------------ | ----- |
| Spoke never handshakes | UDP 51820 blocked by the **provider** firewall | `sudo wg show wg0 latest-handshakes` on the hub — a `0` means no packet ever arrived |
| Handshake fine, hostname times out | Spoke ingress not listening on the tunnel address | From the hub: `curl -sI --resolve <host>:443:10.0.0.2 https://<host>` |
| Every hostname answers `421` | No `--default` peer and the hostname is unbound | `--status`, look for it under `unresolved` |
| Most hostnames stopped routing right after adding a spoke | The first peer was the implicit fallback; a second peer removed it | `--status` — if two or more peers and none has `"default": true`, set one |
| One spoke's LAN is unreachable while another's works | Both peers claim the same LAN CIDR; longest-prefix match gave it to one | `--status` — look for the same CIDR under two peers |
| TLS connects then `503` | SELinux blocking HAProxy's backend connection | `sudo getsebool haproxy_connect_any` — must be `on` |
| One deploy's hostnames absent | Its private conf is not checked out | `--status` reports it under `missing` |
| HTTP/3 fails on any non-default spoke's hostname | Expected — UDP :443 goes whole to the default spoke, never per hostname | Clients fall back to TCP automatically |
| HTTP/3 fails everywhere | No `--default` peer, so nothing receives UDP :443 | `--status` — check `quicTarget` is not empty |
| `--haproxy-sync` throws | HAProxy rejected the candidate config | Previous files were already restored; read the logged `detail` |
| Config edited, but nothing changed on the wire | `wg-quick` reads its config only at start | `--wireguard-setup` logs `restartRequired: true`; apply with `--wireguard-stop --wireguard-start` |
| A re-keyed spoke connects but its traffic goes nowhere | Superseded key still on the live interface claiming the same `AllowedIPs` | `sudo wg show wg0 peers` — re-register under the **same** id, which withdraws the old key |
| `haproxy` will not start after a reset | Fixed: reset now removes `haproxy.cfg` alongside the maps it reads | If an old `haproxy.cfg` survives, `sudo rm -f /etc/haproxy/haproxy.cfg` then `--haproxy-setup` |
| Ports still open after a reset | Reset withdraws firewalld rules for the **recorded role**; a registry with no role withdraws none | `--status` for the role, then `sudo firewall-cmd --permanent --list-all` |

### Rolling back

```bash
node bin wireguard --wireguard-stop      # drop the tunnel and its packet rules
node bin wireguard --wireguard-reset     # remove all host state, keep keys + registry
node bin wireguard --wireguard-reinstall # reset + re-key + reinstall packages
```

`--wireguard-reset` deliberately keeps the key pair: destroying it invalidates every spoke's peer entry. Only `--wireguard-reinstall` re-keys, and it prints exactly which command has to run on the other end afterwards.

---

## Restart, reconnect, reset

Four operations, each with one correct composition. All of them are safe to repeat.

### Restart everything on the VPS

The interface config is read by `wg-quick` **only at start**, so writing a new one does not move a running tunnel onto it. `--wireguard-start` is `systemctl enable --now`, which no-ops on an already-active unit — it will not pick the change up either. A restart is `--wireguard-stop --wireguard-start` in one invocation; the flags are evaluated stop-before-start for exactly this reason:

```bash
# 🟦 HUB — restart the tunnel, republish the routes, restart HAProxy
node bin wireguard --wireguard-stop --wireguard-start
sudo systemctl restart haproxy
node bin wireguard --haproxy-sync
node bin wireguard --status
```

`--haproxy-sync` reloads only when the generated files actually changed, so it is not a restart — it is the *right* thing after a config change and a no-op otherwise. `systemctl restart haproxy` is the blunt instrument for the daemon itself; use it only when you mean it, since a restart drops connections that a reload would have kept.

**The tunnel restart disconnects every spoke for a few seconds.** Each one re-dials within its 25s keepalive, and `--status` shows the handshake ages recovering.

If you want the whole edge rebuilt from the registry rather than restarted, that is the reset path below — it converges to the same state from any starting point.

> `--wireguard-setup` now tells you when this is needed. If it rewrote the interface config while the unit was active, it warns **Interface config changed while the tunnel is up; the live interface still runs the old one** and prints the flags that apply it.

### Reconnect a control-plane spoke, leaving no trace

The trace that matters is on the **hub**, not the spoke: WireGuard identifies a peer by its public key, never by a name. If the spoke re-keys, the hub's old key entry does not go away by itself — and while it lingers it still claims the same `AllowedIPs`, so longest-prefix match can keep routing that traffic to an identity the spoke no longer holds.

**If the spoke keeps its key** (an ordinary reconnect — link flap, reboot, maintenance), there is nothing to clean up. Bounce it:

```bash
# 🟩 SPOKE
node bin wireguard --wireguard-stop --wireguard-start
node bin wireguard --status     # handshake age should reset to a few seconds
```

**If the spoke re-keys** (`--wireguard-reinstall`, or a rebuilt node), re-register it on the hub under the **same peer id**. `--peer-add` drops the superseded key from the live interface before admitting the new one, so no stale identity survives:

```bash
# 🟩 SPOKE — re-key, then read the new public key
node bin wireguard --wireguard-reinstall
node bin wireguard --status

# 🟦 HUB — same id, new key. Bindings you omit keep their stored value.
node bin wireguard \
  --peer-add homelab-a --peer-ip 10.0.0.2 --public-key '<new spoke key>'
```

It logs `rekeyed: true` when it withdrew a superseded key. Confirm nothing lingers:

```bash
# 🟦 HUB — one [Peer] block per registered spoke, and no key you do not recognise
sudo wg show wg0 peers
sudo grep PublicKey /etc/wireguard/wg0.conf
```

Reusing the peer id is the whole trick. A *new* id would leave the old entry in the registry, in the interface config and on the live interface — three traces instead of none.

### Reset the VPS to zero

`--wireguard-reset` withdraws every artifact this subsystem puts on the host:

| Removed | |
| ------- | - |
| `/etc/wireguard/<iface>.conf` | interface config |
| `/etc/sysctl.d/99-underpost-wireguard.conf` | IP forwarding drop-in |
| `/etc/haproxy/haproxy.cfg` + both `.map` files | the generated gateway, config and maps together |
| `UNDERPOST_WG_PRE` / `UNDERPOST_WG_POST` | the QUIC NAT chains |
| firewalld ports and masquerade | withdrawn for the **recorded role**, using the same rule list that opened them |
| `wg-quick@<iface>`, `haproxy` | stopped and disabled |

| Kept | Why |
| ---- | --- |
| `/etc/wireguard/<iface>.key` / `.pub` | destroying the key invalidates every spoke's peer entry |
| `engine-private/deploy/conf.wireguard.json` | authored source; nothing can regenerate it |

```bash
# 🟦 HUB — see exactly what it would do first
node bin wireguard --wireguard-reset --dry-run
node bin wireguard --wireguard-reset

# Rebuild from the registry — same registry, same result, from any starting state
node bin wireguard \
  --wireguard-setup --server --cidr 10.0.0.1/24 --haproxy-setup --wireguard-start
```

The rebuild needs no spoke to do anything: the hub key is unchanged, so every peer entry is still valid and the tunnels re-form on their own.

**Three deeper levels, in order:**

| Level | Command | Costs you |
| ----- | ------- | --------- |
| Host state | `--wireguard-reset` | nothing — spokes reconnect by themselves |
| Host state + identity | `--wireguard-reinstall` | every spoke must be handed the new hub key |
| Everything | `--wireguard-reinstall`, then delete `conf.wireguard.json` | the whole topology; it is authored, so it is gone |

`--wireguard-reinstall` is reset + drop the key pair + reinstall the packages + re-key + re-apply. It prints the exact follow-up for the other end:

```
warn  Re-keyed: this machine now presents a new identity, and the far end still expects the old one
      publicKey:    <new hub key>
      onEverySpoke: --wireguard-setup --client --public-key '<new hub key>'   (peer-ip and endpoint are remembered)
```

To go all the way to nothing, remove the registry by hand after the reinstall — that is deliberate friction, because the peer bindings and public keys exist in no other file:

```bash
rm engine-private/deploy/conf.wireguard.json
node bin wireguard --build-conf     # writes the empty skeleton, warns that it routes nothing
```

### Reconnect the homelab spokes cleanly

After the hub re-keys, every spoke needs the new hub identity — and only that. `--peer-ip` and `--endpoint` are remembered in each spoke's own registry, so the reconnect is one flag:

```bash
# 🟩 SPOKE — on each homelab control-plane
node bin wireguard \
  --wireguard-setup --client --public-key '<new hub key>' \
  --wireguard-stop --wireguard-start

node bin wireguard --status
```

`--wireguard-stop --wireguard-start` is what makes the new config live; without it the spoke keeps dialling with the identity it had. Then, on the hub:

```bash
# 🟦 HUB — every spoke online, recent handshake, routes unchanged
node bin wireguard --status
```

Spoke public keys did **not** change, so no `--peer-add` is needed and the routing table is untouched.

A spoke you are retiring for good is `--peer-remove <id>` on the hub — which drops it from the registry, from the interface config and from the live interface in one pass — followed by `--wireguard-reset` on the spoke itself.

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

## Lifecycle and idempotency

Every lifecycle command produces the same outcome regardless of the host's starting state:

- **Packages** are queried with `rpm -q` first; an already-provisioned host installs nothing.
- **Keys** are generated once and reused; a second `--wireguard-setup` reuses the existing pair.
- **Configs** are compared before writing, and HAProxy is reloaded only when something changed.
- **iptables** rules live in dedicated chains that are flushed and refilled on every apply — no accumulating near-duplicate rules, and no guessing what a previous run installed.
- **firewalld** rules are added with `--permanent`, which is already idempotent, and withdrawn from the *same* rule list on reset, so the two directions cannot drift.
- **`--wireguard-setup` re-runs** inherit every value the registry recorded — role, address, listen port, and on a spoke the hub `endpoint` and `hubPublicKey` — so repeating the setup does not require repeating the flags that established it.
- **`--peer-add` re-runs** merge over the stored entry: flags you pass are updated, flags you omit keep their value. Re-registering a spoke under the same id with a new key withdraws the old key from the live interface first.

### Idempotent on disk is not idempotent in memory

The one place repetition is *not* enough, and the reason the restart section above exists:

| Artifact | Converges on re-run? | |
| -------- | -------------------- | - |
| Files under `/etc` | ✅ | compared byte-for-byte before writing |
| Registry | ✅ | normalized and compared before writing |
| Packages, keys, sysctl, firewalld | ✅ | queried or `--permanent`, never blindly re-applied |
| NAT chains | ✅ | flushed and refilled every apply |
| Peer table on the **live** interface | ✅ | `wg set` adds, updates and withdraws in place |
| The **running** `wg-quick@<iface>` unit | ❌ | reads its config only at start |

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

## Response compression and egress

Egress is metered at the VPS, so a byte reaching a client is a byte billed. The thing to understand before tuning anything is **where a response body can still be compressed** — and the answer follows directly from the port split above.

The `:443` path is encrypted end to end from the client to the cluster's own ingress. HAProxy reads the SNI without decrypting, `underpost-ingress` forwards the stream with `ssl_preread`, and the tunnel carries ciphertext. **Nothing on that path can compress anything**, because nothing on it can see a body. Compression has to happen at or behind TLS termination, and what leaves through the tunnel is then whatever that produced — the data plane re-encrypts the body it was handed, it does not re-encode it.

| Hop | Sees a body? | Compresses |
| ----- | ----- | ----- |
| HAProxy `fe_https` (`:443` TCP) | No — SNI preread only | — |
| HAProxy `fe_http` (`:80` HTTP) | Yes | Not enabled; carries redirects and ACME only |
| `underpost-ingress` `:443` / `:443/udp` | No — L4 passthrough and DNAT | — |
| `underpost-ingress` `:80` | Yes | gzip (brotli when declared) |
| `underpost-gateway` | Yes | gzip + `gzip_static` (brotli when declared) |
| Application runtime (API paths) | Yes | Express `compression` middleware |

`underpost-gateway` is where nearly all of it is recovered. Every host that declares a status page is routed through it for its whole site path — not only for the intercepted documents — so the HTML, CSS and JS of those hosts already pass through the one hop that holds them in the clear. API sub-paths are routed straight to the workload and are compressed by the runtime instead.

Both Nginx configs are rendered from one policy in `src/server/underpost-compression.js`: `gzip_vary` is always on, `gzip_proxied any` is set (Nginx's default of `off` would otherwise skip exactly the proxied responses these workloads forward), and the type list excludes already-compressed media, along with `text/html`, which Nginx compresses whether it is listed or not.

Three environment variables control it, read wherever the manifests are rendered:

| Variable | Default | Effect |
| ----- | ----- | ----- |
| `UNDERPOST_NGINX_COMPRESSION` | on | `off` / `0` / `false` / `no` renders no compression directive at all |
| `UNDERPOST_NGINX_IMAGE` | `nginx:alpine` | Image for both Nginx workloads |
| `UNDERPOST_NGINX_BROTLI_MODULES` | unset | Directory holding `ngx_http_brotli_*_module.so` |

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

## Relationship to `underpost-ingress` and `underpost-gateway`

Three distinct layers, each one hop apart:

| Layer | Where | Owns |
| ----- | ----- | ----- |
| `underpost wireguard` / HAProxy | Edge VPS | Public listener; SNI/Host routing across the L3 tunnel to a cluster |
| `underpost-ingress` | Each cluster's node | The node's 80/443; hands each connection to Contour or Envoy Gateway |
| `underpost-gateway` | Inside the cluster | Status pages, intercepted contexts; a backend the data planes route to |

TLS is terminated exactly once, at the cluster's own ingress. See [Main cluster lifecycle commands](<./Main cluster lifecycle commands.md>) for the two inner layers.
