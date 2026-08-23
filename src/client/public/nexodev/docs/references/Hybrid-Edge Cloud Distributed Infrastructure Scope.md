# Hybrid-Edge Cloud Distributed Infrastructure Scope: Architecture & Future Roadmap

**Document Status:** Draft / Vision Statement

**Version:** 3.3.0 | **Status:** Draft | **Authors:** Underpost Engineering

**Scope:** Distributed Hybrid-Edge, Multi-Site Overlay Network, Bare-Metal Provisioning & Resilient Power Stack

## 1. Executive Summary & Infrastructure Vision

This document outlines the strategic target state for the core development and production infrastructure. The primary goal is to build an enterprise-grade, high-availability, hybrid platform that connects edge entry points (Cloud/VPS) with physically distributed bare-metal Kubernetes clusters (Homelabs) hidden behind dynamic ISP and CGNAT topologies.

### Core Architectural Pillars

- **Zero-Trust Edge Transport:** Secure Layer 4 SNI passthrough and UDP/QUIC forwarding without edge TLS termination.
- **Encrypted L3 Overlay Mesh:** Seamless site-to-site connectivity using WireGuard hub-and-spoke routing.
- **Automated Bare-Metal Lifecycle:** Out-of-band management, PXE provisioning, and automated OS deployment via Canonical MAAS.
- **Fault-Tolerant Infrastructure Powering:** Multi-tier electrical redundancy (Grid, Auto-Generator, Online UPS, Smart PDU, and automated NUT clients).

## 2. Distributed Edge Routing & Multi-Site Overlay Architecture

The edge layer acts as a public entry point with static IPv4/IPv6 capabilities. It forwards incoming client traffic directly to private, distributed Kubernetes clusters without decrypting application data at the edge.

```
                                 PUBLIC INTERNET
                                         │
                              DNS / Hostname Resolution
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                           EDGE DATA CENTER LAB (VPS)                           │
├────────────────────────────────────────────────────────────────────────────────┤
│ Public IPv4 / IPv6 Static IP                                                   │
│                                                                                │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │                  L4 EDGE PROXY / TCP-UDP GATEWAY                           | |
| |           (TCP/UDP forwarding + SNI/Host-based routing)                    │ │
│ │                   (HAProxy / NGINX STREAM / Envoy)                         │ │
│ │                                                                            │ │
│ │ TCP :80  ──► L4 Passthrough / Forwarding ─────────► 10.0.0.x:80            │ │
│ │                                                                            │ │
│ │ TCP :443 ──► L4 SNI Routing (TLS ClientHello)                              │ │
│ │               ├─ app-a.example.com ───────────────► 10.0.0.2:443           │ │
│ │               ├─ app-b.example.com ───────────────► 10.0.0.3:443           │ │
│ │               └─ app-n.example.com ───────────────► 10.0.0.N:443           │ │
│ │                                                                            │ │
│ │ UDP :443 ──► L4 UDP/QUIC Forwarding                                        │ │
│ │               ├─ app-a.example.com ───────────────► 10.0.0.2:443/UDP       │ │
│ │               ├─ app-b.example.com ───────────────► 10.0.0.3:443/UDP       │ │
│ │               └─ app-n.example.com ───────────────► 10.0.0.N:443/UDP       │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                │
│ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ │                            L3 WIREGUARD HUB                                │ │
│ │                                                                            │ │
│ │ Interface: wg0 | CIDR: 10.0.0.0/24 | Address: 10.0.0.1 | Listen: UDP:51820 │ │
│ │ Overlay Routing Table:                                                     │ │
│ │   ├─ Homelab A (10.0.0.2) ──► Route network 192.168.20.0/24                │ │
│ │   ├─ Homelab B (10.0.0.3) ──► Route network 192.168.30.0/24                │ │
│ │   └─ Homelab N (10.0.0.N) ──► Route network 192.168.N0.0/24                │ │
│ └────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │
                           WireGuard Encrypted Tunnel
                     (Transport: UDP :51820 | CIDR: 10.0.0.0/24)
                                        │
                ┌───────────────────────┴───────────────────────┐
                │                                               │
                ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│          HOMELAB A            │               │          HOMELAB N            │
├───────────────────────────────┤               ├───────────────────────────────┤
│ Dynamic ISP / CGNAT Router    │               │ Dynamic ISP / CGNAT Router    │
│ Production Subnet:            │               │ Production Subnet:            │
│ 192.168.20.0/24               │               │ 192.168.N0.0/24               │
│ WireGuard Peer: 10.0.0.2      │               │ WireGuard Peer: 10.0.0.N      │
│ PersistentKeepalive = 25s     │               │ PersistentKeepalive = 25s     │
│                               │               │                               │
│ ┌───────────────────────────┐ │               │ ┌───────────────────────────┐ │
│ │  KUBERNETES INGRESS LAYER │ │               │ │  KUBERNETES INGRESS LAYER │ │
│ │ Envoy / NGINX CI / Traefik│ │               │ │ Envoy / NGINX CI / Traefik| │
│ │                           │ │               │ │                           │ │
│ │ ├─ TCP :80 HTTP/ACME (301)│ │               │ │ ├─ TCP :80 HTTP/ACME (301)│ │
│ │ ├─ TCP :443 ★ TLS TERM.   │ │               │ │ ├─ TCP :443 ★ TLS TERM.   │ │
│ │ └─ UDP :443 (QUIC/HTTP3)  │ │               │ │ └─ UDP :443 (QUIC/HTTP3)  │ │
│ │                           │ │               │ │                           │ │
│ │ [hostNetwork / NodePort]  │ │               │ │ [hostNetwork / NodePort]  │ │
│ └─────────────┬─────────────┘ │               │ └─────────────┬─────────────┘ │
│               │               │               │               │               │
│ ──────────────┴────────────── │               │ ──────────────┴────────────── │
│  BARE-METAL KUBEADM CLUSTER   │               │  BARE-METAL KUBEADM CLUSTER   │
│ ───────────────────────────── │               │ ───────────────────────────── │
│                               │               │                               │
│ ┌───────────────────────────┐ │               │ ┌───────────────────────────┐ │
│ │ PHYSICAL CONTROL PLANE    │ │               │ │ PHYSICAL CONTROL PLANE    │ │
│ │ (Bare-Metal Machine)      │ │               │ │ (Bare-Metal Machine)      │ │
│ └─────────────┬─────────────┘ │               │ └─────────────┬─────────────┘ │
│               │ Internal CNI  │               │               │ Internal CNI  │
│               ▼               │               │               ▼               │
│ ┌───────────────────────────┐ │               │ ┌───────────────────────────┐ │
│ │ PHYSICAL WORKER NODES     │ │               │ │ PHYSICAL WORKER NODES     │ │
│ │ (Bare-Metal Servers)      │ │               │ │ (Bare-Metal Servers)      │ │
│ └───────────────────────────┘ │               │ └───────────────────────────┘ │
└───────────────────────────────┘               └───────────────────────────────┘
```

## 3. Bare-Metal, Management Planes & Electrical Power Infrastructure

To ensure enterprise stability, physical nodes rely on segregated management networks (OOB/BMC), automated bare-metal provisioning (MAAS), and a resilient power continuity stack.

```
       +------------------------------------------------------------------+
       |                  MAAS REGION / RACK CONTROLLER                   |
       |  - Cron Jobs: Node Discovery & BMC Power State Polling           |
       |  - Alert Engine: Webhooks / SNMP Traps / Health Monitoring       |
       +------------------------------------------------------------------+
              |                                             |
              | [ OOB Management Network ]                  | [ In-Band Provisioning Net ]
              | VLAN 100 (192.168.100.0/24)                 | VLAN 10 (192.168.10.0/24)
              |                                             |
   1. Redfish / IPMI API                         2. DHCP / PXE / TFTP Boot
  (Power On/Off/Reset Cmds)                     (OS Kernel & Cloud-Init)
              |                                             |
              v                                             v
+---------------------------+                 +----------------------------+
|     POWER / BMC LAYER     |                 |   PRIMARY NETWORK LAYER    |
| iDRAC / iLO Dedicated Port|                 |   Main NIC Interface (eth0)│
+-------------+-------------+                 +-------------+--------------+
              |                                             |
    Standby Power Rail                            In-Band Data & Provisioning
  (Powers BMC Chip 24/7)                         (Runs OS, K8s, WireGuard)
              |                                             |
              +--------------------+------------------------+
                                   |
                                   | Clean AC Power Line (110V/220V)
                                   v
       +------------------------------------------------------------------+
       |                     GENERIC BARE-METAL NODE                      |
       |  +------------------------------------------------------------+  |
       |  | Internal Power Units (Dual PSUs)                           |  |
       |  |  -> Standby Rail  ──► Continuously Powers BMC Chip         |  |
       |  |  -> Main 12V Rail ──► Powers CPU, RAM, NICs on Host Boot   |  |
       |  +------------------------------------------------------------+  |
       |  | In-Band OS / Data Layer (VLAN 20 - Production Subnet):     |  |
       |  |  - NUT Client (nut-monitor): Monitored via Network         |  |
       |  |  - Graceful Shutdown Service: Triggered on Low Battery     |  |
       |  |  - Production Workloads: WireGuard / K8s Kubelet / Services|  |
       |  +------------------------------------------------------------+  |
       +------------------------------------------------------------------+
                                   ^
                                   | Protected AC Output
                                   |
       +------------------------------------------------------------------+
       |                      SMART PDU LAYER                             |
       |  - Managed Outlets: Per-port power monitoring and cycling        |
       +------------------------------------------------------------------+
                                   ^
                                   | Cleaned AC Output
                                   |
       +------------------------------------------------------------------+
       |             ONLINE DOUBLE-CONVERSION UPS                         |
       |  - Battery Buffer Phase: Instant power backup during grid loss   |
       |  - Network Management Card (NMC): Monitored via SNMP (VLAN 100)  |
       +------------------------------------------------------------------+
                                   ^
                                   | Switched AC Input
                                   |
       +------------------------------------------------------------------+
       |                  ATS (AUTOMATIC TRANSFER SWITCH)                 |
       |  - Senses Utility Outage -> Signals Generator Auto-Start         |
       |  - Waits for Generator Warmup & Voltage Stabilization (~10-30s)  |
       |  - Transfers Source Load: Utility Grid ===> Generator Power      |
       +------------------------------------------------------------------+
                                   ^
                      +------------+------------+
                      |                         |
               Primary AC Grid           Emergency AC Backup
                      |                         |
                      v                         v
       +--------------------------+  +------------------------------------+
       |    UTILITY POWER GRID    |  |       DIESEL / GAS GENERATOR       |
       |    (Normal Operation)    |  |  1. Outage Detected -> Cold Start  |
       |                          |  |  2. Warmup Phase (Engine & RPM)    |
       |                          |  |  3. Stable Output -> Accepts Load  |
       +--------------------------+  +------------------------------------+
```

## 4. Custom Edge & Ingress Component Specification

To prevent port binding conflicts and guarantee uptime visibility, custom ingress proxy utilities are introduced into the Kubernetes cluster topology.

| COMPONENT         | COMPONENT TYPE                         | MAIN FUNCTION                                                                                                                                                                     |
| ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| underpost-ingress | L4/L7 Edge Port Router                 | • Unifies network entry on host ports 80/443.<br>• Prevents port conflicts between Envoy Gateway and Contour.<br>• Performs SNI passthrough while preserving certificates intact. |
| underpost-gateway | Static Server & Middleware Interceptor | • Utility Layer.<br>• Intercepts 50x errors via `proxy_intercept_errors`.<br>• Serves local static HTML from disk (`/var/www/static`) whenever the app fails or goes offline.     |

## 5. Architectural Reference: OSI Model Mapping

The complete infrastructure stack is categorized according to the standard 7-Layer OSI Open Systems Interconnection model:

- **Layer 7 — Application Layer**
  - _Description:_ Provides network services directly to end-user applications and workloads.
  - _Key Services:_ HTTP/3, HTTPS, TLS termination on K8s Ingress, web applications, API Endpoints, and `underpost-gateway` static interceptor.
- **Layer 6 — Presentation Layer**
  - _Description:_ Formats, encrypts, and prepares data between client and application layers.
  - _Key Services:_ TLS 1.3 encryption handshake, SNI host header parsing, JSON/Protobuf serialization.
- **Layer 5 — Session Layer**
  - _Description:_ Manages persistent communication sessions and connections.
  - _Key Services:_ Keep-alive sessions, HTTP/2 multiplexed streams, gRPC channels, and QUIC session resumption.
- **Layer 4 — Transport Layer**
  - _Description:_ Manages end-to-end transport, port addressing, and packet stream control.
  - _Key Services:_ TCP (Ports 80/443), UDP (Port 443 QUIC and Port 51820 WireGuard), `underpost-ingress` stream forwarding.
- **Layer 3 — Network Layer**
  - _Description:_ Handles logical IP addressing and inter-subnet routing.
  - _Key Services:_ IPv4/IPv6 static edge routing, WireGuard L3 Overlay network (`10.0.0.0/24`), Calico/Cilium CNI pod routing.
- **Layer 2 — Data Link Layer**
  - _Description:_ Facilitates node-to-node frame transfer within local network segments.
  - _Key Services:_ Managed VLANs (VLAN 100 OOB, VLAN 10 Provisioning, VLAN 20 Production), L2 switching, ARP, MAC-level binding.
- **Layer 1 — Physical Layer**
  - _Description:_ Physical hardware, power delivery systems, and physical transmission media.
  - _Key Services:_ Ethernet (Cat6a/SFP+), iDRAC/iLO physical interfaces, ATS, Online Double-Conversion UPS, Smart PDUs, Bare-Metal Server Chassis.

## 6. Strategic Next Steps & Roadmap

1. **MTU Optimization:** Calibrate internal Kubernetes CNI MTU (to \~1380 bytes) to compensate for WireGuard encapsulation overhead.
2. **Edge High Availability:** Explore secondary Edge VPS nodes with BGP Anycast or automated DNS failover to mitigate Edge VPS SPOF.
3. **Automated DR & Power Off:** Conduct simulated blackout testing to verify NUT client battery threshold triggers and orderly k8s node draining.
