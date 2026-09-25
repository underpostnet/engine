# Socket Security and Code Analysis

`underpost socketsecurity` audits a checkout in two domains and writes one report:

| Domain                  | What it covers                                                                                                                | Fixed by                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Dependency security** | The external packages the checkout installs: advisories, malware, install scripts, reputation, capabilities.                  | An upgrade, a Socket patch, a replacement.     |
| **Source code risk**    | Alerts on this project's own code: anomalies, dynamic code, environment, filesystem, shell and network access, embedded URLs. | A change to the code at the reported location. |

The Socket CLI (`@socketsecurity/cli`) executes; `src/server/security/socketsecurity.js` drives
it, classifies the findings and renders the report; `src/cli/socketsecurity.js` is the command.

---

## Configuration

| Variable                  | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `SOCKET_CLI_API_TOKEN`    | Socket API token. Required for `scan`, `--reach`, `--ci` and `socket fix`. |
| `SOCKET_CLI_ORG_SLUG`     | Socket organization. Passed as `--org` to every command that takes one.    |
| `SOCKET_CLI_ACCEPT_RISKS` | Accept the risks of a Socket-wrapped `npm`/`npx` run.                      |
| `GITHUB_ORG_NAME`         | Organization scope under which this project's own packages also publish.   |

The values resolve through the platform environment chain: the process
environment, `./.env`, then the global `underpost` `.env`. The token reaches the
Socket CLI through the child environment, never through a command line.

They are host-scope keys (`engine-private/deploy/scopes/host.env.production`).
`underpost host load` projects them onto a node; a CI repository receives them with
`underpost secret rotate --args "secret=SOCKET_CLI_API_TOKEN|SOCKET_CLI_ORG_SLUG,source=host,deploy-id=<id>"`
(see [SOPS Age Secret Management](manage-secrets-with-sops.md#rotating-github-actions-secrets)).

The CLI is a development dependency, so `node_modules/.bin/socket` exists after
`npm install`. A host that installs the engine with `--omit=dev` needs
`npm install -g @socketsecurity/cli` for the patch hook to act.

---

## Commands

```bash
underpost socketsecurity                 # audit both domains: reports under security-reports/
underpost socketsecurity --reach         # audit with full application reachability (token)
underpost socketsecurity --ci            # audit, non-zero exit on a failed or unhealthy scan, or a high finding in either domain
underpost socketsecurity --fix           # dependency remediation pass, then the audit
underpost socketsecurity --patch-scan    # patches available for the installed versions
underpost socketsecurity --patch-get <uuid|CVE|GHSA|PURL>
underpost socketsecurity --patch-apply   # replay .socket/manifest.json (the prepare hook)
underpost socketsecurity --patch-setup   # install the prepare hook in package.json
```

`npm run security:socket` runs the audit, `npm run security:socket:ci` the gate. `--fail-on <severity>`
moves the gate threshold for both domains.

---

## The audit

One run collects, in order:

1. Dependency segregation: the static import graph from the runtime entry points
   (`src/server/build/package.js`, `RUNTIME_ENTRY_POINTS`). Every package it
   reaches must be in `dependencies`, or be pinned by a product catalog.
2. `npm audit --json`.
3. `socket patch scan`: free patches without a token, the organization tier with one.
4. With a token: `socket scan create --report` (policy health), then `socket scan view` (every
   package with its per-file alerts). `--reach` adds the full application reachability analysis.

The scan artifacts feed both domains. Without a token, source code risk is reported as skipped.

### Which domain an alert belongs to

The owner of the code decides, not the file path. An alert is **source code risk** when its package
is one of this project's own packages:

- the `package.json` name and every `bin` name (`underpost-engine`, `underpost`);
- the same names under the repository owner scope and the `GITHUB_ORG_NAME` scope
  (`@underpostnet/underpost`, `@underpost/underpost`).

Every other alert is **dependency security**. A path test alone would misfile a dependency whose
tarball also has a `src/` directory. The own packages appear in a scan when a checkout depends on
them — a product such as `engine-cyberia` depends on `underpost` — so the analysis of the
published code maps back onto this source tree.

### Categories

One table classifies Socket alert types for both domains (`ALERT_CATEGORIES`). Unknown types fall
into **Other**.

| Category                           | Alert types (examples)                                                                  | Dependency meaning                 | Source code refactoring task                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Malware and supply chain attacks   | `malware`, `gptMalware`, `didYouMean`, `troll`, `manifestConfusion`                     | Remove the package now.            | Treat as an incident: confirm, remove, rotate reachable credentials.                      |
| Registry advisories                | `criticalCVE`, `cve`, `mediumCVE`, `mildCVE`, npm audit, patches                        | Upgrade or patch.                  | Fix the vulnerable code path and publish a patched version.                               |
| Install scripts and native code    | `installScripts`, `hasNativeCode`                                                       | Review the lifecycle script.       | Remove the script or binary, or document why the install needs it.                        |
| Package reputation and maintenance | `unpopularPackage`, `unmaintained`, `deprecated`, `newAuthor`                           | Consider a maintained alternative. | Correct the package metadata.                                                             |
| Dependency resolution              | `gitDependency`, `httpDependency`, `missingDependency`                                  | Pin to a registry version.         | Declare the dependency with a registry range, or remove the import.                       |
| License                            | `copyleftLicense`, `licenseSpdxDisj`, `unclearLicense`                                  | Check the license policy.          | Record the license of the file, or replace it.                                            |
| Code anomalies                     | `gptAnomaly`, `gptSecurity`, `potentialVulnerability`, `obfuscatedFile`, `minifiedFile` | Review the package.                | Review; fix and test a real defect; keep generated or minified content out of `src/`.     |
| Debug, reflection and dynamic code | `debugAccess`, `usesEval`, `dynamicRequire`                                             | Capability of the package.         | Replace `eval`, `new Function` and computed imports with static imports or an allow-list. |
| Environment variable access        | `envVars`                                                                               | Capability of the package.         | Read through `environmentValueFactory`; declare the owner in `CONFIG_OWNERSHIP`.          |
| Filesystem access                  | `filesystemAccess`                                                                      | Capability of the package.         | Resolve against a declared root; refuse a path that leaves it.                            |
| Network access and embedded URLs   | `networkAccess`, `urlStrings`                                                           | Capability of the package.         | Move the URL or address into configuration, or confirm the public endpoint.               |
| Shell access                       | `shellAccess`                                                                           | Capability of the package.         | Quote with `shellArgumentFactory`; run through `shellExec` under the execution profile.   |

### Locations

A source finding points at this checkout:

- The npm tarball prefix `package/` is dropped: `package/src/client/public/app.js` becomes
  `src/client/public/app.js`.
- A path that resolves outside the checkout is refused; the finding keeps only its package.
- When the analyzed version is the checked-out version, the alert offset becomes a line:
  `src/cli/deploy.js:212`. An older published version keeps the file without a line.
- A file absent from the checkout is marked `(not in this checkout)`.

Findings group into one **refactoring task** per category, with the most severe severity and every
location.

### Dependency findings and reachability

Dependency findings merge per package and advisory (npm audit and Socket patches) or per package
version and alert type (Socket scan). Each one carries a reachability tier:

| Tier | Evidence                                                                       |
| ---- | ------------------------------------------------------------------------------ |
| 1    | Full application analysis (`--reach`): reachable or unreachable from this code |
| 2    | Socket scan alert: package-level analysis, on the Socket dashboard             |
| 3    | Registry advisory or patch listing only. Treat as reachable                    |

---

## Reports

Outputs, under `security-reports/` (or `--out <dir>`):

| File                         | Content                                    |
| ---------------------------- | ------------------------------------------ |
| `security-report.md`         | The report a person reads                  |
| `security-report.json`       | The same report, for a workflow            |
| `npm-audit.json`             | Raw `npm audit` document                   |
| `socket-patch-scan.json`     | Raw patch scan                             |
| `socket-scan.json`           | Raw policy report, when the scan ran       |
| `socket-scan-artifacts.json` | Raw scan artifacts with per-file alerts    |
| `socket-reach.json`          | Raw reachability facts, when `--reach` ran |

`security-report.md` sections: **Summary** (severities per domain), **Socket scan**,
**Dependency Security** (findings by category, segregation, npm audit, reachability, patches,
remediation, deferred risks), **Source Code Risk Analysis** (status, own packages, refactoring
tasks, findings by category).

`security-report.json` top level:

| Key                  | Content                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `scan`               | `ok`, `healthy`, `scanId`, `url`, `artifacts` — or `skipped`                                                                |
| `dependencySecurity` | `segregation`, `npmAudit`, `reachability`, `patches`, `remediation`, `categories`, `counts`, `findings`, `deferred`         |
| `sourceCodeRisk`     | `status`, `packages`, `categories`, `counts`, `tasks`, `findings` (`category`, `type`, `severity`, `file`, `line`, `local`) |
| `counts`             | Severities across both domains                                                                                              |

---

## Remediation

`--fix` is the dependency pass: `npm audit fix` (no `--force`), `socket patch get` for one patch per
package version, `socket fix --no-major-updates` (token), and `socket patch apply`. `--major` lets
`socket fix` apply major upgrades. The audit that follows writes the post-remediation report;
dependency findings that no non-breaking action resolves are listed under **Deferred risks** with
the reason.

Source code risk has no automatic pass: each refactoring task is a code change, reviewed like any
other.

---

## Patches on install

`package.json` runs `node bin socketsecurity --patch-apply` on `prepare`, which npm runs on
`npm install` and `npm ci` in this checkout and never on an install of the published tarball, so
no consumer of the package executes an install script. It executes
`socket patch apply --ecosystems npm` against `.socket/manifest.json`:

- A recorded patch is applied, or verified when already applied.
- A package whose installed version differs from the manifest is skipped.
- A checkout without a manifest, or a host without the Socket CLI, is a no-op.
- A patch that fails to apply fails the install.

Commit `.socket/` with the patches it records; `socket patch get` writes it.
