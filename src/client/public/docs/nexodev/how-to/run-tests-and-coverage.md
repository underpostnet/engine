# Testing and Coverage

Every test run — a laptop, a CI container, a pod on the cluster — goes through
`underpost test`. There is one runner (Vitest), one project table
(`src/server/build/testing.js`), and one coverage output (`coverage/lcov.info`).

---

## Layout

The filesystem answers one question: **which domain owns this behaviour?** The
project table answers the other: **when does this test run?** The directory is
`test/<domain>/<level>/`, and it is the selector — nothing enumerates test files
by name, and no directory name carries an execution order.

```text
test/
  underpost/                         engineering platform: CLI, delivery, infrastructure
    unit/
    integration/                     platform APIs over a real server and database
      security/                      SELinux, systemd units, SOPS secret store, Socket audit
      network/                       WireGuard edge transport
      cluster/                       instance clustering, node placement
      ingress/                       gateways, ingress, routes, traffic plans
      observability/                 monitoring, deploy monitor, events, remediation
    audit/                           whole-tree platform invariants
    e2e/                             public routes in a real browser
      scenarios/                     event rehearsals (`node bin event`, never collected)
  object-layer/unit/                 canonical identity, lifecycle, render, purge
  item-ledger/                       registration, indexing, ownership, provenance
    unit/
    integration/                     against a live EVM
  cyberia/                           runtime, studio, engine and CLI
    unit/
    integration/                     content releases on a real MongoDB, the product CLI
    e2e/                             WebSocket load against a running server
  cryptokoyn/unit/                   wallet identity, signatures, account record
  ecosystem/                         the relationships between domains
    contract/                        API contract, cross-domain reads, docs and structured data
    integration/                     what one domain publishes and another serves
  support/                           shared helpers: mongod, binaries, shell harness

hardhat/test/                        Solidity contracts (delegated, see below)
```

A domain only carries the levels it needs. MongoDB and the blockchain are
integration boundaries, not domains: a Cyberia content release on a replica set
is `cyberia/integration`, and ItemLedger against a chain is
`item-ledger/integration`.

`test/underpost/e2e/scenarios/` holds the rehearsals `node bin event <id> --e2e-test`
loads. They break real hosts, so no project collects them; `EVENT_E2E.scenarioDirectory`
in `src/cli/event.js` is the only thing that names that directory.

---

## Domains

| Domain         | Owns                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `underpost`    | Shared CLI, infrastructure, delivery, operational platform behaviour |
| `object-layer` | Canonical registry and protocol: identity, lifecycle, render, purge  |
| `item-ledger`  | On-chain registration, indexing, ownership and provenance            |
| `cyberia`      | Runtime, Game Studio, engine, CLI, content and releases              |
| `cryptokoyn`   | CKY finance hub: wallet surface and account record                   |
| `ecosystem`    | Cross-domain contracts and integration boundaries                    |

A test that verifies a relationship between two domains belongs to `ecosystem`,
never to whichever domain is under development.

---

## Levels

| Level         | Guarantees                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| `unit`        | Business logic, every collaborator in memory. No database, process or browser |
| `integration` | One real boundary: a database, a spawned process, a served API, a binary      |
| `contract`    | The interface between independently owned components                          |
| `e2e`         | A complete workflow, through a real browser or a running server               |
| `audit`       | Platform, security and operational invariants over the whole tree             |

Each level up gives a different guarantee, never the same assertions again. A
unit test proves the logic; the integration test above it proves the boundary;
the contract test proves the interface; the end-to-end test proves the journey.
A temporary directory is not a boundary: a suite that writes a fixture under
`mkdtemp` is still a unit test.

---

## Selectors

Each domain and level pair is a Vitest project. The project id is
`<domain>:<level>`, and `<domain>:<level>:<area>` where a level runs in ordered
areas, so a selector needs no second lookup table.

| Selector                        | Runs                                  |
| ------------------------------- | ------------------------------------- |
| `cyberia`                       | every Cyberia project                 |
| `cyberia:unit`                  | one project                           |
| `underpost:integration`         | the five ordered areas                |
| `underpost:integration:ingress` | one area                              |
| `ecosystem:contract`            | the cross-domain contracts            |
| `item-ledger:contract`          | `hardhat/test` — delegated, see below |
| `all`, or no argument           | every project                         |

```bash
underpost test                          # every project, in order
underpost test underpost,ecosystem      # the platform and the contracts between domains
underpost test underpost:integration:ingress  # one area
underpost test cyberia:unit --grep shape      # one project, filtered by test name
underpost test item-ledger:contract     # Solidity contracts, on Hardhat's EVM
underpost test --watch --no-coverage    # local iteration
underpost test --list                   # what a selector resolves to
```

An unknown selector fails with the list of valid ones. A mistyped selector must
never produce a green run over zero tests.

---

## Changed-source selection

`--changed` runs what a change can break, and nothing else. The mapping from a
source path to the domains it reaches is `TEST_IMPACT` in
`src/server/build/testing.js` — one table, read by the CLI and by CI alike.

```bash
underpost test --changed                # the working tree and the index, against HEAD
underpost test --changed origin/master  # everything a branch changed
underpost test --changed --print        # print the selector instead of running it
```

The model is deterministic, not a dependency graph:

| Change                              | Selects                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `src/projects/cyberia/…`            | `cyberia`                                             |
| `src/api/object-layer/…`            | every domain that reads the protocol, and `ecosystem` |
| `src/server/domain/…`               | `ecosystem` and every product domain                  |
| `src/server/network/…`, `deploy/…`  | `underpost`                                           |
| `vitest.config.js`, `test/support/` | `all` — it decides how everything runs                |
| anything the table does not map     | `all`                                                 |

An incomplete model over-tests; it never under-tests. A path no rule matches
widens to every domain rather than selecting none.

---

## Execution order

Order is execution policy, so it lives in the project table and never in a
directory name. Vitest sequences on `sequence.groupOrder`: equal values run in
parallel, lower values run to completion first.

```text
groupOrder  1        2                    3                   4…8                      9              10
            audit    every :unit project  ecosystem:contract  security → network →     integration    e2e
                                                              cluster → ingress →      projects
                                                              observability
```

A gateway assertion that fails because SELinux denied a bind is a security
failure surfacing at the ingress layer, so the lower area has to have run — and
passed — before the higher one is worth reading.

Unit and contract projects run their files in parallel. Every other project runs
its files one at a time: those suites bind ports, drive databases, spawn
processes or read the deploy tree, and cannot share a worker.

> `groupOrder` starts at 1, never 0. Vitest routes a project left on the
> default `0` with a single worker into a bucket it appends _after_ every
> ordered group — which silently runs the first project last.

---

## Workflows

| Stage            | Runs                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Local change     | `npm run test:changed` — the affected domains only                         |
| Pull request     | the same selection, from the merge base, with the coverage gate            |
| Push to `master` | the platform, the contracts and every product domain, with the gate        |
| Release          | the above, plus the delegated contract suites and the infrastructure audit |

End-to-end and audit projects stay small and separately addressable. They are
not the regression mechanism: a behaviour that a unit or integration test can
prove is proven there.

---

## Delegated projects

A project with a `delegate` in the table runs on its own runner instead of as a
Vitest project, after the Vitest pass. `item-ledger:contract` is one: Hardhat
owns Solidity compilation and the EVM the suites run against, so Vitest cannot
collect them.

The project compiles with `hardhat build`, then runs the suites — plain
`node:test` files — on Node's own runner rather than through `hardhat test`.
Hardhat pins a reporter with no machine-readable output; Node's runner composes
reporters, so one run prints readably and emits the JUnit XML the dashboard
ingests.

A delegated project whose directory is absent is skipped with a warning rather
than failing: a product build strips the projects it does not own.

Solidity coverage is Hardhat's own instrumentation and is not merged into
`coverage/lcov.info` — run `npm run coverage` in `hardhat/` for it.

---

## Product contexts

A product owns the test projects in the directories its catalog strips from the
base template. `dd-cyberia` strips `test/cyberia` and `hardhat`, so it owns the
`cyberia:*` projects and `item-ledger:contract`.

A product project runs only in its product context. The context is active when
the product catalog is present and `package.json` declares every package the
catalog pins in `packageDependencies`.

| Checkout                                          | `dd-cyberia` context                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Engine repository                                 | inactive: the manifest does not declare `jimp`, `pngjs`, `maxrects-packer`, `sharp` |
| `node bin/build dd-cyberia --coverage` (CI build) | active: the build installs the catalog pins before it runs the suites               |
| `engine-cyberia` repository                       | active: the product manifest declares the pins                                      |

Outside its context, `node bin test` skips the product projects and logs a
warning with the missing packages. To run them in an engine checkout, install the
catalog with `node bin package dd-cyberia --install`. That command writes the
pins to `package.json` and `package-lock.json`: do not commit these changes.

A platform suite that loads a product module gates only that part, with
`cyberiaContext` from `test/support/product-context.js`. Import the product
module only when the context is active: a static import fails before the skip
applies.

```js
const { AtlasSpriteSheetService } = cyberiaContext
  ? await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js')
  : {};

describe.skipIf(!cyberiaContext)('the render of a definition', () => {
  // …
});
```

---

## Coverage

`@vitest/coverage-v8` replaces `c8`. The reporters are `text` (local),
`lcovonly` (Coveralls), `json` (merging across CI jobs) and `html` (the report a
deploy publishes). `lcov.info` and `coverage-final.json` are written to
`coverage/`, so `coveralls < ./coverage/lcov.info` is unchanged; the HTML report
is written to `coverage/<key>/`, where `key` is the domains the selection spans
joined with `-` — `node bin test underpost,ecosystem` writes
`coverage/underpost-ecosystem/`, `node bin test cyberia` writes
`coverage/cyberia/`, and a run that spans every domain writes `coverage/all/`.
Two selections never overwrite each other's report on a host that publishes both.

Coverage is scoped to the files a run actually loads rather than all of `src`.
The client bundles and generated assets under it are shipped, not executed by
any suite, and instrumenting them would report a floor no test can move.

### The client docs block

A client declares its whole documentation surface in `conf.client.json`, under
`docs`:

```json
"docs": {
  "canonical": true,
  "typedoc": {
    "name": "CYBERIA Online",
    "entryPoints": ["./src/server", "./src/api"],
    "out": "./public/www.cyberiaonline.com/docs/",
    "readme": "./src/client/public/docs/cyberia/overview/index.md"
  },
  "coverage": [
    { "id": "cyberia", "label": "Cyberia coverage", "suite": "cyberia" },
    { "id": "hardhat", "label": "Hardhat coverage", "path": "./hardhat" }
  ],
  "references": ["./src/client/public/docs/cyberia", "./src/client/public/docs/ecosystem"],
  "api": ["cyberia-entity", "cyberia-map", "object-layer", "item-ledger"]
}
```

- `typedoc` overrides the engine default `typedoc.json`, the only TypeDoc file
  the engine keeps. A product declares its own options here.
- `references` names documentation directories, usually one domain each under
  `src/client/public/docs`. The build reads them to any depth. A document's path is
  its identity, `<domain>/<category>/<slug>`: the build publishes it at
  `/docs/<domain>/<category>/<slug>.md` and writes the navigation to
  `/docs/manifest.json`.
- `canonical` marks the one client whose merged options `node bin/build <deploy-id>`
  writes to the product repository root as `typedoc.json`.
- `coverage` declares the HTML reports the client publishes.
- `api` names the API modules the OpenAPI document covers, out of the ones the
  instance serves. Without it, the served modules whose router carries `#swagger`
  annotations are documented.

### Publishing the HTML reports

Each `coverage` entry is one report, served at `/docs/coverage/<id>` and offered
as one entry of the docs menu:

- `suite` names a selection; the report is the one `node bin test <suite>` writes
  to `coverage/<key>/`. A deploy shows the run it names, never the last run a host
  happened to make: `dd-core` declares `underpost,ecosystem` — the `coverall.ci.yml`
  selection — and `dd-cyberia` declares `cyberia`.
- `path` names another tree that produces its own report under `coverage/`
  (`html/`, `lcov-report/` or flat) — Hardhat's Solidity coverage, from
  `npm run coverage` in `hardhat/`.

The reports are produced by the build stage and travel with the deploy artifact;
no workload container ever runs a test runner to obtain one.

- `node bin/build <deploy-id> --coverage` runs `node bin test <suite>` for every
  suite the deploy ids' reports name, then assembles the template. Without the
  flag, whatever the run directories already hold is bundled as-is.
- Assembly copies each report into the artifact at `docs/coverage/<id>`, which
  is published with the deploy source (`engine-<id>` / `engine-test-<id>`).
- The client build (`node bin client <deploy-id>`) publishes each report at
  `/docs/coverage/<id>`, preferring the run output over the bundled artifact.
  When neither is present it writes a static "report unavailable" page naming
  the command that produces it.

A container that generated its own report would spend minutes of its build phase
on a test runner, and every expected non-zero exit of the suite latched
`container-status=error`, failing a healthy rollout at the deployment monitor.

---

## Migrating a Mocha suite

`globals: true` keeps `describe`, `it` and the hooks global, and Chai stays the
assertion library, so most files move unchanged. Four things do not:

| Mocha                                             | Vitest                                                    |
| ------------------------------------------------- | --------------------------------------------------------- |
| `before` / `after`                                | `beforeAll` / `afterAll`                                  |
| `describe(name, function () { this.timeout(n) })` | `describe(name, { timeout: n }, () => {})`                |
| `this.skip()` inside a test                       | destructure the context: `it(name, ({ skip }) => skip())` |
| `this.skip()` inside a hook                       | `describe.skipIf(condition)(...)` — skips at collection   |
| `.mocharc.json` `spec` + `c8 --exclude` arrays    | a project per domain and level                            |

`this` is not a suite context in Vitest: an arrow function is safe everywhere,
and a `function ()` callback gains nothing.

---

## In-cluster execution

Two ways to run on the cluster, both writing Allure results to the same claim
the dashboard reads.

**Inside an existing deployment's pods** — `--deploy-list` execs into every pod
of each deploy and re-enters as `underpost test <suite> --itc`. `--itc` means
"this is the execution context; run here" and is what stops the recursion.

```bash
underpost test underpost:integration --deploy-list dd-core,dd-cyberia --namespace default
```

**As a Job** — for a run that owns its lifetime and outlives no pod.

```bash
underpost test underpost:integration --job --image underpost/engine:v3.4.0
underpost test --job --image underpost/engine:v3.4.0 --dry-run   # print the manifest
```

The Job carries `backoffLimit: 0` and `restartPolicy: Never`: a test run is a
diagnostic, and a crash loop would hide the failure it exists to report.

---

## Allure dashboard

```bash
underpost test --dashboard                              # NodePort 32350
underpost test --dashboard --host nexodev.org           # also routed at /allure
underpost test --dashboard --dry-run                    # print the manifests
```

`--dashboard` applies a PVC, the report server, a NodePort Service, and — when
`--host` is given — an HTTPProxy that rides the certificate already issued for
that host instead of needing one of its own.

The server watches the results directory rather than being pushed a report, so
a Job that writes its results and exits needs no callback and no ordering
against the dashboard's own lifecycle. `--allure` on any run writes into it.

```text
underpost test --allure ──▶ allure-results/ ──▶ allure-pvc ──▶ allure ──▶ /allure
   (local, pod, or Job)                          (shared)      (watches)   (dashboard)
```

Allure is a reporter and a static report server: no operator, no CRDs, and
nothing to install ahead of the tests. Testkube would add in-cluster scheduling
and run history on top, at the cost of a Helm-installed control plane; the Job
path above covers dynamic triggering without it.

---

## CI

| Workflow                                 | Push to `master`                                               | Pull request                    |
| ---------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| `coverall.ci.yml`                        | `underpost,ecosystem,object-layer,item-ledger:unit,cryptokoyn` | `--changed` from the merge base |
| `coverall.cyberia.ci.yml`                | the same, plus `cyberia`                                       | `--changed` from the merge base |
| `pwa-microservices-template-test.ci.yml` | `underpost,ecosystem`                                          | —                               |
| `hardhat.ci.yml`                         | `npm test` in `hardhat/`                                       | —                               |

A pull request resolves its selector with `node bin test --changed <base> --print`,
so CI reads the same impact model the CLI does and no workflow carries a path
list of its own. A push to the release branch runs the broad selection with the
coverage gate: fast feedback is a pull-request concern, and it never replaces
release validation.

The platform job measures the platform and the contracts, and the cyberia job the
whole tree, so the two badges read the same metric over the surfaces each product
ships. The base template strips `test/cyberia`; the `cyberia:*` projects then
match no files, which is not an error as long as another project has some.

`hardhat.ci.yml` is path-filtered to `hardhat/**` and installs only that
project's lockfile, so it stays on Hardhat's own tasks rather than pulling the
whole engine in to reach the runner. `underpost test item-ledger:contract` is the
entry point everywhere else.
