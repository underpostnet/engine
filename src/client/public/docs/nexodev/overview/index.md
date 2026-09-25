---
title: Nexodev
domain: Nexodev
identity: ERP/CRM, DevOps and cloud services on the shared Underpost CLI
maturity: Active development
order: 5
---

# Nexodev

Nexodev delivers ERP and CRM products, DevOps practice and cloud services. It operates the
platform with the shared Underpost CLI rather than a toolchain of its own.

## Purpose

Nexodev documentation answers how to run the infrastructure: bring up a cluster, deploy an
instance, manage secrets and images, observe what is running, and recover it.

## Responsibilities

| Nexodev owns                                               | Nexodev does not own                               |
| ---------------------------------------------------------- | -------------------------------------------------- |
| ERP and CRM products                                       | The Underpost CLI itself, which Underpost owns     |
| DevOps practice and cloud service delivery                 | Product domain semantics                           |
| Infrastructure procedure: clusters, hosts, secrets, images | Architecture decisions, which are recorded as ADRs |
| The operational reference for the platform's deployments   | Game or protocol content                           |

## Boundaries

The Underpost CLI is the shared platform tool. Nexodev documents its use for infrastructure
work; it never redefines the CLI as a Nexodev technology. Its lineage is recorded in the
Underpost domain.

## Current maturity

Active development. The procedures here are in use against real deployments.

## Main components

| Component         | What it covers                                                  |
| ----------------- | --------------------------------------------------------------- |
| Cluster lifecycle | Creating, updating and tearing down Kubernetes clusters         |
| Host management   | Baremetal, LXD, SSH and edge connectivity                       |
| Delivery          | Images, deployments, static publishing and repository mirroring |
| Operations        | Secrets, backups, observability, events, testing and coverage   |

## Documentation map

| Category    | What it holds                                                             |
| ----------- | ------------------------------------------------------------------------- |
| Explanation | Infrastructure scope, the PWA and SSR delivery model, wallet identity     |
| How-to      | Every operational procedure, from getting started to running the edge hub |
| Reference   | The Underpost CLI and the cluster lifecycle commands                      |
