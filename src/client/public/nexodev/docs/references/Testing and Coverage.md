# Testing and Coverage

Every test run — a laptop, a CI container, a pod on the cluster — goes through
`underpost test`. There is one runner (Vitest), one tier table
(`src/server/testing.js`), and one coverage output (`coverage/lcov.info`).

---

## Layout

Tests are grouped by the layer they exercise, and the directory _is_ the
selector. Nothing enumerates test files by name.

```text
test/
  unit/                              pure functions, no host or cluster
  integration/
    infra/
      1-security/                    SELinux, systemd units, SOPS secret store
      2-network/                     WireGuard edge transport
      3-cluster/                     instance clustering, node placement
      4-ingress/                     gateways, ingress, routes, traffic plans
      5-observability/               monitoring, deploy monitor, events, remediation
    app/                             platform application layer
      cyberia/                       Cyberia MMO extension
  e2e/                               event rehearsal scenarios (`node bin event`, never collected)

hardhat/test/                        Solidity contracts (delegated tier, see below)
```

`test/e2e/` holds the scenarios `node bin event <id> --e2e-test` loads. They
break real hosts, so no tier collects them; `EVENT_E2E.scenarioDirectory` in
`src/cli/event.js` is the only thing that names that directory.

---

## Suites and tiers

Each directory is a Vitest project. The project id is the tier name, and the
part before `:` is the suite it belongs to — so `--suite infra` needs no second
lookup table.

| Selector              | Runs                                   |
| --------------------- | -------------------------------------- |
| `unit`                | `test/unit`                            |
| `infra`               | all five `infra:*` tiers               |
| `app`                 | `test/integration/app` (non-recursive) |
| `cyberia`             | `test/integration/app/cyberia`         |
| `contracts`           | `hardhat/test` — delegated, see below  |
| `all`, or no argument | every tier                             |
| `infra:2-network`     | one tier                               |

```bash
underpost test                       # every tier, in tier order
underpost test unit,infra            # platform suites only
underpost test infra:4-ingress       # one tier
underpost test cyberia --grep shape  # one tier, filtered by test name
underpost test contracts             # Solidity contracts, on Hardhat's EVM
underpost test --watch --no-coverage # local iteration
```

An unknown selector fails with the list of valid ones. This is the difference
that motivated the migration: a mistyped path used to produce a green run over
zero tests.

---

## Tier lifecycle

Tiers are a lifecycle, not a taxonomy. A gateway assertion that fails because
SELinux denied a bind is a security failure surfacing at the ingress layer, so
the lower tier has to have run — and passed — before the higher one is worth
reading.

Vitest expresses that with `sequence.groupOrder` per project: equal values run
in parallel, lower values run to completion first.

```text
groupOrder  1     2           3          4          5          6                7
            unit  1-security  2-network  3-cluster  4-ingress  5-observability  app ∥ cyberia ∥ contracts
```

`app`, `cyberia` and `contracts` share order 7 because none can invalidate the
others.

> `groupOrder` starts at 1, never 0. Vitest routes a project left on the
> default `0` with a single worker into a bucket it appends _after_ every
> ordered group — which silently runs the first tier last.

---

## Delegated tiers

A tier with a `delegate` in the table runs on its own runner instead of as a
Vitest project, after the Vitest pass. `contracts` is one: Hardhat owns Solidity
compilation and the EVM the suites run against, so Vitest cannot collect them.

The tier compiles with `hardhat build`, then runs the suites — plain `node:test`
files — on Node's own runner rather than through `hardhat test`. Hardhat pins a
reporter with no machine-readable output; Node's runner composes reporters, so
one run prints readably and emits the JUnit XML the dashboard ingests.

A delegated tier whose directory is absent is skipped with a warning rather than
failing: a product build strips the tiers it does not own.

Solidity coverage is Hardhat's own instrumentation and is not merged into
`coverage/lcov.info` — run `npm run coverage` in `hardhat/` for it.

---

## Coverage

`@vitest/coverage-v8` replaces `c8`. The reporters are `text` (local),
`lcov` (Coveralls) and `json` (merging across CI jobs), all written to
`coverage/`, so `coveralls < ./coverage/lcov.info` is unchanged.

Coverage is scoped to the files a run actually loads rather than all of `src`.
The client bundles and generated assets under it are shipped, not executed by
any suite, and instrumenting them would report a floor no test can move.

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
| `.mocharc.json` `spec` + `c8 --exclude` arrays    | a project per directory                                   |

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
underpost test infra --deploy-list dd-core,dd-cyberia --namespace default
```

**As a Job** — for a run that owns its lifetime and outlives no pod.

```bash
underpost test infra --job --image underpost/engine:v3.3.0
underpost test --job --image underpost/engine:v3.3.0 --dry-run   # print the manifest
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

| Workflow                                 | Command                     | Coveralls flag |
| ---------------------------------------- | --------------------------- | -------------- |
| `coverall.ci.yml`                        | `node bin test unit,infra`  | `core`         |
| `coverall.cyberia.ci.yml`                | `node bin test app,cyberia` | `cyberia`      |
| `pwa-microservices-template-test.ci.yml` | `node bin test unit,infra`  | —              |
| `hardhat.ci.yml`                         | `npm test` in `hardhat/`    | —              |

The two coverage jobs partition the Vitest tiers exactly, so nothing is counted
twice and nothing is missed. The base template strips
`test/integration/app/cyberia`; its `cyberia` project then matches no files,
which is not an error as long as another tier has some.

`hardhat.ci.yml` is path-filtered to `hardhat/**` and installs only that
project's lockfile, so it stays on Hardhat's own tasks rather than pulling the
whole engine in to reach the runner. `underpost test contracts` is the entry
point everywhere else.
