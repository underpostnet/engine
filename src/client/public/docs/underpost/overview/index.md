---
title: Underpost
domain: Underpost
identity: Engineering log, development journal, technical lab and engineering history
maturity: Engineering / continuous
order: 6
---

# Underpost

Underpost is the base platform and the engineering lineage every other domain is built on. It
owns the toolchain, the deployment surface, the PWA delivery model and the operational
infrastructure. Every product domain — Object Layer, ItemLedger, Cyberia, CryptoKoyn, Nexodev —
runs on it; none of them owns it.

## Purpose

This domain records how the platform is built and why it is built that way: the engineering
history, the experiments behind a decision, and the decisions themselves.

## Responsibilities

| Underpost owns                                       | Underpost does not own                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| The shared Underpost CLI and its engineering lineage | Product features, which each product domain owns |
| Engineering history and the development journal      | Operational procedures, which Nexodev documents  |
| Laboratory notes: experiments and investigations     | Protocol semantics, which Object Layer owns      |
| Architecture Decision Records                        | A second copy of any product domain's manual     |

## Boundaries

Underpost documentation never restates a product domain's manual. It records decisions,
experiments and history. A reader who wants to operate a cluster reads Nexodev; a reader who
wants to know why the cluster works that way reads an ADR here.

## Current maturity

Engineering / continuous. The platform is under active development and its record grows with it.

## Toolchain and base infrastructure

Underpost Platform covers the shared delivery surface for applications and extensions:

| Area            | What it owns                                                                         |
| --------------- | ------------------------------------------------------------------------------------ |
| Toolchain       | `underpost` CLI, build, deploy, release, metadata, secrets, environment selection    |
| Infrastructure  | bare metal, LXD, Kubernetes, K3s, kubeadm, images, SSH, runners                      |
| Data operations | MongoDB, MariaDB where needed, backups, cron, monitoring                             |
| Delivery        | static build, SSR views, PWA packaging, service worker generation, host/path routing |

The platform is the operational backbone. It should stay the source of truth for deploy IDs, runtime selection, host/path layout, generated client assets, and environment resolution.

---

## PWA delivery model

Every deployed client is delivered as a static application shell with PWA support.

- SSR views declare which pages exist and which fallbacks are precached.
- The service worker is generated from the configured view set.
- Offline and maintenance fallbacks are part of the build output, not hand-maintained runtime artifacts.
- Generated outputs such as `sw.js`, static pages, and compiled bundles are outputs only; never edit them by hand.

```text
underpost.config.dd-*.js / conf.ssr.json    +    src/client/sw/core.sw.js
			   │
			   └──── underpost client / build ────▶ generated index.html + sw.js + precache
```

Keep those two inputs as the only authored PWA sources.

---

## Documentation map

| Category            | What it holds                                                      |
| ------------------- | ------------------------------------------------------------------ |
| Engineering journal | Chronological engineering history and development records          |
| Lab notes           | Experiments, investigations and operational findings               |
| ADR                 | Architecture Decision Records: the decision, its context, its cost |
