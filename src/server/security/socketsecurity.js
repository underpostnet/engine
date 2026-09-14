/**
 * Socket.dev security audit: dependency scans, reachability analysis, security patches, source
 * code alerts on this project's own packages, and the report built over them and `npm audit`.
 *
 * The Socket CLI (`@socketsecurity/cli`) executes; this module resolves its configuration,
 * builds its command lines, parses its JSON, and renders the report. The patch manifest
 * (`.socket/manifest.json`) records the patches a checkout carries, and `socket patch apply`
 * replays it on every install of the checkout through the `prepare` hook this module installs.
 *
 * @module src/server/security/socketsecurity.js
 * @namespace SocketSecurityService
 */
'use strict';

import fs from 'fs-extra';
import nodePath from 'node:path';
import { loggerFactory } from '../ops/logger.js';
import { environmentValueFactory } from '../runtime/environment.js';
import { shellArgumentFactory, shellExec } from '../runtime/process.js';

const logger = loggerFactory(import.meta);

/**
 * Socket CLI integration.
 * @class SocketSecurityService
 * @memberof SocketSecurityService
 */
class SocketSecurityService {
  /** Environment variables the Socket CLI reads; resolved through the platform env chain. */
  static ENV = {
    token: 'SOCKET_CLI_API_TOKEN',
    orgSlug: 'SOCKET_CLI_ORG_SLUG',
    acceptRisks: 'SOCKET_CLI_ACCEPT_RISKS',
  };

  static CLI_PACKAGE = '@socketsecurity/cli';
  static ECOSYSTEM = 'npm';
  static MANIFEST_PATH = '.socket/manifest.json';
  /** Reachability report `socket scan create --reach` writes next to the manifests it scans. */
  static FACTS_PATH = '.socket.facts.json';
  static DASHBOARD_URL = 'https://socket.dev/dashboard/org';
  static REPORT_DIRECTORY = 'security-reports';
  static REPORT_FILES = {
    report: 'security-report.json',
    markdown: 'security-report.md',
    npmAudit: 'npm-audit.json',
    scan: 'socket-scan.json',
    reach: 'socket-reach.json',
    scanArtifacts: 'socket-scan-artifacts.json',
    packageAlerts: 'socket-package-alerts.json',
    patchScan: 'socket-patch-scan.json',
    /** Written by `socket fix --output-file`: the upgrades it computed. */
    fixUpgrades: 'socket-fix-upgrades.json',
  };

  /** The apply command the `prepare` hook runs. */
  static PATCH_APPLY_ARGS = ['patch', 'apply', '--ecosystems', SocketSecurityService.ECOSYSTEM];
  /**
   * The hook runs through the CLI, so an install on a host without Socket skips it. It is a
   * `prepare` script: npm runs it on an install of this checkout, never on an install of the
   * published tarball, so no consumer of the package executes it.
   */
  static PREPARE_SCRIPT = 'node bin socketsecurity --patch-apply';

  static SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];

  /**
   * Lowest policy level `socket scan create --report` reports. The CLI defaults to `error`, which
   * drops every monitor, warn and ignore alert from the policy report the findings read their
   * action from.
   */
  static REPORT_LEVEL = 'defer';

  /** Report domains: what an alert is about decides who fixes it. */
  static DOMAINS = {
    dependency:
      'Risks in the external packages this checkout installs. An upgrade, a patch or a replacement fixes them.',
    source:
      "Alerts Socket raises on this project's own published package. A change to the code at the reported location fixes them.",
  };

  /** Socket alert severities on the report scale. */
  static SOCKET_SEVERITIES = { low: 'low', middle: 'moderate', high: 'high', critical: 'critical' };

  /**
   * Alert categories by Socket alert type, in report order. `task` is the refactor a source
   * finding in the category becomes.
   */
  static ALERT_CATEGORIES = {
    malware: {
      label: 'Malware and supply chain attacks',
      types: [
        'malware',
        'gptMalware',
        'didYouMean',
        'gptDidYouMean',
        'troll',
        'compromisedSSHKey',
        'manifestConfusion',
        'shellScriptOverride',
        'binScriptConfusion',
        'suspiciousStarActivity',
        'telemetry',
      ],
      task: 'Treat as an incident: confirm the code path, remove it, and rotate every credential it can reach.',
    },
    advisories: {
      label: 'Registry advisories',
      types: ['criticalCVE', 'cve', 'mediumCVE', 'mildCVE'],
      task: 'Fix the vulnerable code path and publish a patched version.',
    },
    installScripts: {
      label: 'Install scripts and native code',
      types: ['installScripts', 'hasNativeCode'],
      task: 'Remove the lifecycle script or the binary, or document why the install needs it.',
    },
    reputation: {
      label: 'Package reputation and maintenance',
      types: [
        'unpopularPackage',
        'unmaintained',
        'deprecated',
        'newAuthor',
        'unstableOwnership',
        'missingAuthor',
        'noAuthorData',
        'trivialPackage',
        'emptyPackage',
        'majorRefactor',
        'chronoAnomaly',
        'semverAnomaly',
        'unpublished',
        'missingTarball',
        'noRepository',
        'noV1',
        'noTests',
        'noREADME',
        'noBugTracker',
        'noWebsite',
        'badSemver',
      ],
      task: 'Correct the package metadata the alert names.',
    },
    resolution: {
      label: 'Dependency resolution',
      types: [
        'gitDependency',
        'gitHubDependency',
        'httpDependency',
        'fileDependency',
        'floatingDependency',
        'missingDependency',
        'extraneousDependency',
        'uncaughtOptionalDependency',
        'unusedDependency',
        'unresolvedRequire',
        'peerDependency',
        'shrinkwrap',
        'badSemverDependency',
        'invalidPackageJSON',
        'typeModuleCompatibility',
        'socketUpgradeAvailable',
      ],
      task: 'Declare the dependency in package.json with a registry version range, or remove the import.',
    },
    license: {
      label: 'License',
      types: [
        'licenseSpdxDisj',
        'copyleftLicense',
        'nonpermissiveLicense',
        'unidentifiedLicense',
        'noLicenseFound',
        'explicitlyUnlicensedItem',
        'miscLicenseIssues',
        'deprecatedLicense',
        'deprecatedException',
        'licenseChange',
        'licenseException',
        'missingLicense',
        'mixedLicense',
        'ambiguousClassifier',
        'modifiedException',
        'modifiedLicense',
        'nonFSFLicense',
        'nonOSILicense',
        'nonSPDXLicense',
        'notice',
        'unclearLicense',
        'unsafeCopyright',
      ],
      task: 'Record the license of the flagged file, or replace the file.',
    },
    codeAnomaly: {
      label: 'Code anomalies',
      types: [
        'gptAnomaly',
        'gptSecurity',
        'potentialVulnerability',
        'obfuscatedFile',
        'obfuscatedRequire',
        'highEntropyStrings',
        'suspiciousString',
        'longStrings',
        'minifiedFile',
        'bidi',
        'invisibleChars',
        'zeroWidth',
        'homoglyphs',
        'badEncoding',
      ],
      task: 'Review the flagged code. Fix and test a real defect; keep generated or minified content out of the source tree.',
    },
    debugAccess: {
      label: 'Debug, reflection and dynamic code',
      types: ['debugAccess', 'usesEval', 'dynamicRequire'],
      task: 'Replace eval, new Function and computed imports with static imports or an explicit allow-list.',
    },
    envVars: {
      label: 'Environment variable access',
      types: ['envVars'],
      task: 'Read the key through environmentValueFactory and declare its owner in CONFIG_OWNERSHIP (src/server/runtime/config-scope.js).',
    },
    filesystem: {
      label: 'Filesystem access',
      types: ['filesystemAccess'],
      task: 'Resolve the path against a declared root and refuse a path that leaves it.',
    },
    network: {
      label: 'Network access and embedded URLs',
      types: ['networkAccess', 'urlStrings'],
      task: 'Move the URL or address into configuration, or confirm it is a public endpoint the code must reach.',
    },
    shell: {
      label: 'Shell access',
      types: ['shellAccess'],
      task: 'Quote every argument with shellArgumentFactory and run the command through shellExec, so the execution profile gates it.',
    },
    other: { label: 'Other', types: [], task: 'Review the flagged code and record the decision.' },
  };

  /** Reachability evidence a finding carries in the report. */
  static REACHABILITY_TIERS = {
    1: 'Full application reachability: analyzed against this code base (`socket scan create --reach`).',
    2: 'Package-level reachability: a Socket scan alert; the package analysis is on the Socket dashboard.',
    3: 'No reachability evidence: a registry advisory or a patch listing only. Treat as reachable.',
  };

  /**
   * Resolves the Socket configuration from the environment chain.
   * @param {Function} [read] - Environment reader.
   * @returns {{token: string, orgSlug: string, acceptRisks: string}}
   */
  static socketEnvFactory(read = environmentValueFactory) {
    const { token, orgSlug, acceptRisks } = SocketSecurityService.ENV;
    return { token: read(token), orgSlug: read(orgSlug), acceptRisks: read(acceptRisks) };
  }

  /**
   * The `--org` arguments for commands that take one.
   * @param {{orgSlug?: string}} [env]
   * @returns {string[]}
   */
  static orgArgsFactory(env = {}) {
    return env.orgSlug ? ['--org', env.orgSlug] : [];
  }

  /**
   * Environment for a Socket child process: the current one plus the resolved Socket values,
   * so a token read from an env file reaches the CLI without appearing on a command line.
   * @param {{token?: string, orgSlug?: string, acceptRisks?: string}} env
   * @param {NodeJS.ProcessEnv} [base]
   * @returns {NodeJS.ProcessEnv}
   */
  static childEnvFactory(env = {}, base = process.env) {
    const values = Object.entries(SocketSecurityService.ENV)
      .filter(([key]) => env[key])
      .map(([key, name]) => [name, env[key]]);
    return { ...base, ...Object.fromEntries(values) };
  }

  /**
   * Locates the Socket CLI: the project's own install first, then the PATH.
   * @param {{root?: string, execute?: Function}} [options]
   * @returns {string} Binary path, empty when Socket is not installed.
   */
  static socketBinaryFactory({ root = process.cwd(), execute = shellExec } = {}) {
    const local = nodePath.join(root, 'node_modules', '.bin', 'socket');
    if (fs.existsSync(local)) return local;
    const found = execute('command -v socket', { silent: true, silentOnError: true, stdout: true, disableLog: true });
    return `${found ?? ''}`.trim().split('\n')[0];
  }

  /**
   * Builds one Socket command line.
   * @param {string[]} args
   * @param {{binary?: string}} [options]
   * @returns {string}
   */
  static socketCommandFactory(args = [], { binary = 'socket' } = {}) {
    return [binary, ...args].map(shellArgumentFactory).join(' ');
  }

  /**
   * Parses the JSON document a command printed, skipping the lines before it.
   * @param {string} text
   * @returns {object|Array|null}
   */
  static parseJsonOutput(text = '') {
    const source = `${text ?? ''}`;
    for (const { index } of source.matchAll(/^[[{]/gm)) {
      try {
        return JSON.parse(source.slice(index));
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Normalizes a Socket command result. The main CLI prints an `{ok, message, cause, data}`
   * envelope; the patch commands print a bare object with a `status`.
   * @param {{code?: number, stdout?: string, stderr?: string}} [execution]
   * @returns {{ok: boolean, code: number, data: *, message: string}}
   */
  static socketResultFactory({ code = 0, stdout = '', stderr = '' } = {}) {
    const parsed = SocketSecurityService.parseJsonOutput(stdout);
    const envelope = parsed !== null && typeof parsed === 'object' && 'ok' in parsed;
    const ok = envelope ? parsed.ok === true : code === 0 && parsed?.status !== 'error';
    const failure = envelope
      ? [parsed.message, parsed.cause].filter(Boolean).join(': ')
      : [parsed?.error, ...(parsed?.results ?? []).map((entry) => entry?.error)].filter(Boolean).join('; ') ||
        `${stderr}`.trim().split('\n').filter(Boolean).pop() ||
        '';
    return { ok, code, data: envelope ? (parsed.data ?? null) : parsed, message: ok ? '' : failure };
  }

  /**
   * Runs one Socket command in a checkout and returns its normalized result.
   * @param {string[]} args
   * @param {object} [options]
   * @param {string} [options.root] - Checkout to run in.
   * @param {Function} [options.execute] - Command executor.
   * @param {object} [options.env] - Resolved Socket configuration.
   * @param {boolean} [options.silent] - Hide the live output; long-running commands show it.
   * @param {string} [options.binary] - Socket binary; resolved when absent.
   * @returns {{ok: boolean, code: number, data: *, message: string, unavailable?: boolean}}
   */
  static runSocket(
    args,
    {
      root = process.cwd(),
      execute = shellExec,
      env = SocketSecurityService.socketEnvFactory(),
      silent = true,
      binary = SocketSecurityService.socketBinaryFactory({ root, execute }),
    } = {},
  ) {
    if (!binary)
      return {
        ok: false,
        code: 127,
        data: null,
        message: `${SocketSecurityService.CLI_PACKAGE} is not installed`,
        unavailable: true,
      };
    const result = execute(SocketSecurityService.socketCommandFactory(args, { binary }), {
      cwd: root,
      silent,
      silentOnError: true,
      env: SocketSecurityService.childEnvFactory(env),
    });
    return SocketSecurityService.socketResultFactory(result);
  }

  /**
   * The installed Socket CLI version, empty when it is not installed.
   * @param {{root?: string, execute?: Function}} [options]
   * @returns {string}
   */
  static socketVersion(options = {}) {
    const binary = SocketSecurityService.socketBinaryFactory(options);
    if (!binary) return '';
    const { execute = shellExec, root = process.cwd() } = options;
    const output = execute(SocketSecurityService.socketCommandFactory(['--version', '--no-banner'], { binary }), {
      cwd: root,
      silent: true,
      silentOnError: true,
      stdout: true,
      disableLog: true,
    });
    return `${output ?? ''}`.trim().split('\n').pop() ?? '';
  }

  /**
   * Sort rank of a severity: most severe first, unknown last.
   * @param {string} [severity]
   * @returns {number}
   */
  static severityRank(severity = '') {
    const rank = SocketSecurityService.SEVERITIES.indexOf(`${severity}`.toLowerCase());
    return rank === -1 ? SocketSecurityService.SEVERITIES.length : rank;
  }

  /**
   * Summarizes an `npm audit --json` document.
   * @param {object} [audit]
   * @returns {{counts: object, dependencies: object, findings: object[]}}
   */
  static npmAuditSummaryFactory(audit = {}) {
    const counts = {
      ...Object.fromEntries(SocketSecurityService.SEVERITIES.map((severity) => [severity, 0])),
      total: 0,
      ...(audit.metadata?.vulnerabilities ?? {}),
    };
    const fixLabel = (fix) => {
      if (!fix) return 'none';
      if (fix === true) return 'update';
      return `${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major)' : ''}`;
    };
    const findings = Object.values(audit.vulnerabilities ?? {})
      .map((vulnerability) => ({
        name: vulnerability.name,
        severity: vulnerability.severity,
        range: vulnerability.range,
        direct: vulnerability.isDirect === true,
        fix: fixLabel(vulnerability.fixAvailable),
        advisories: (vulnerability.via ?? [])
          .filter((via) => typeof via === 'object')
          .map(({ title, url, severity, range, cwe }) => ({ title, url, severity, range, cwe: cwe ?? [] })),
        via: (vulnerability.via ?? []).filter((via) => typeof via === 'string'),
      }))
      .sort((a, b) => SocketSecurityService.severityRank(a.severity) - SocketSecurityService.severityRank(b.severity));
    return { counts, dependencies: audit.metadata?.dependencies ?? {}, findings };
  }

  /**
   * Runs `npm audit` on a checkout. A non-zero exit reports findings, so it is not a failure.
   * @param {{root?: string, execute?: Function}} [options]
   * @returns {{raw: object, summary: object}}
   */
  static npmAudit({ root = process.cwd(), execute = shellExec } = {}) {
    const result = execute('npm audit --json', { cwd: root, silent: true, silentOnError: true });
    const raw = SocketSecurityService.parseJsonOutput(result?.stdout) ?? {};
    return { raw, summary: SocketSecurityService.npmAuditSummaryFactory(raw) };
  }

  /**
   * Runs `npm audit fix` without `--force`: only semver-compatible updates. A non-zero exit
   * means vulnerabilities remain, not that the updates failed.
   * @param {{root?: string, execute?: Function}} [options]
   * @returns {{ok: boolean, code: number, message: string}}
   */
  static npmAuditFix({ root = process.cwd(), execute = shellExec } = {}) {
    const code = execute('npm audit fix --no-fund', { cwd: root, silentOnError: true })?.code ?? 0;
    return { ok: code === 0, code, message: code === 0 ? '' : 'vulnerabilities remain after the compatible updates' };
  }

  /**
   * Flattens a `socket scan report` document into one row per alert.
   * @param {object} [report] - Report data, folded per version.
   * @returns {{healthy: boolean|null, scanId: string, orgSlug: string, url: string, alerts: object[]}}
   */
  static scanReportSummaryFactory(report = {}) {
    const alerts = [];
    const walk = (node, keys) => {
      if (node && typeof node === 'object' && 'type' in node && 'policy' in node) {
        const [ecosystem, name, version, file] = keys;
        alerts.push({ ecosystem, package: name, version, file, ...node });
        return;
      }
      for (const [key, value] of Object.entries(node ?? {})) walk(value, [...keys, key]);
    };
    walk(report?.alerts ?? {}, []);
    const { scanId = '', orgSlug = '' } = report ?? {};
    return {
      healthy: typeof report?.healthy === 'boolean' ? report.healthy : null,
      scanId,
      orgSlug,
      url: scanId && orgSlug ? `${SocketSecurityService.DASHBOARD_URL}/${orgSlug}/sbom/${scanId}` : '',
      alerts,
    };
  }

  /**
   * Reads the reachability analysis into one row per (package, advisory).
   * @param {object} [facts] - The `.socket.facts.json` document.
   * @returns {{available: boolean, analyzed: number, counts: object, results: object[]}}
   */
  static reachabilityFactory(facts = null) {
    const components = Array.isArray(facts?.components) ? facts.components : [];
    const results = components.flatMap((component) =>
      (component.reachability ?? []).map((entry) => {
        const outcomes = (entry.reachability ?? []).map((result) => result.type);
        return {
          package: component.name,
          version: component.version,
          ghsaId: entry.ghsa_id,
          reachable: outcomes.includes('reachable')
            ? true
            : outcomes.length > 0 && outcomes.every((type) => type === 'unreachable')
              ? false
              : null,
          outcomes,
        };
      }),
    );
    const counts = { reachable: 0, unreachable: 0, undetermined: 0 };
    for (const { reachable } of results)
      counts[reachable === true ? 'reachable' : reachable === false ? 'unreachable' : 'undetermined']++;
    return { available: facts !== null, analyzed: components.length, counts, results };
  }

  /**
   * Creates a Socket full scan of a checkout, reports it against the organization policy, and
   * reads its artifacts: every package with its per-file alerts.
   *
   * The scan uploads dependency manifests only, so its artifacts are the packages the checkout
   * installs; this project's own code is read from the registry by {@link packageAlerts}. With
   * `reach`, the reachability analysis runs locally over the working tree. A facts file left by
   * an earlier run is removed before it starts, because the CLI takes one it finds as
   * pre-generated input instead of analyzing, and the fresh one is consumed after it.
   * @param {object} [options]
   * @param {string} [options.root]
   * @param {Function} [options.execute]
   * @param {object} [options.env]
   * @param {string} [options.binary] - Socket binary; resolved when absent.
   * @param {boolean} [options.reach]
   * @param {string} [options.repo]
   * @param {string} [options.branch]
   * @param {string[]} [options.targets]
   * @returns {{ok: boolean, message: string, summary: object, artifacts: object[]|null, report: object|null, facts: object|null, reachability: object}}
   */
  static scan({
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
    reach = false,
    repo = '',
    branch = '',
    targets = ['.'],
  } = {}) {
    const factsPath = nodePath.join(root, SocketSecurityService.FACTS_PATH);
    if (reach) fs.removeSync(factsPath);
    const result = SocketSecurityService.runSocket(
      [
        'scan',
        'create',
        '--json',
        '--report',
        '--report-level',
        SocketSecurityService.REPORT_LEVEL,
        '--no-interactive',
        '--no-banner',
        ...(reach ? ['--reach', '--reach-retain-facts-file'] : []),
        ...(repo ? ['--repo', repo] : []),
        ...(branch ? ['--branch', branch] : []),
        ...SocketSecurityService.orgArgsFactory(env),
        ...targets,
      ],
      { root, execute, env, binary, silent: false },
    );
    const facts = reach && fs.existsSync(factsPath) ? fs.readJsonSync(factsPath, { throws: false }) : null;
    if (facts !== null) fs.removeSync(factsPath);
    const summary = SocketSecurityService.scanReportSummaryFactory(result.data);
    const view =
      result.ok && summary.scanId
        ? SocketSecurityService.runSocket(
            ['scan', 'view', summary.scanId, '--json', '--no-banner', ...SocketSecurityService.orgArgsFactory(env)],
            { root, execute, env, binary },
          )
        : null;
    return {
      ok: result.ok && view?.ok !== false,
      message: result.message || view?.message || '',
      unavailable: result.unavailable === true,
      summary,
      artifacts: Array.isArray(view?.data) ? view.data : null,
      report: result.data,
      facts,
      reachability: SocketSecurityService.reachabilityFactory(facts),
    };
  }

  /**
   * The registry coordinates of this project's own published packages: each own name at the
   * checked-out version when that version is published, at its latest version otherwise, and
   * left out when the registry does not carry it.
   * @param {object} [params]
   * @param {object} [params.packageJson]
   * @param {string[]} [params.ownPackages] - `ownPackageNamesFactory` result.
   * @param {string} [params.root]
   * @param {Function} [params.execute]
   * @returns {Array<{name: string, version: string, current: boolean, purl: string}>}
   */
  static publishedPackagesFactory({
    packageJson = {},
    ownPackages = [],
    root = process.cwd(),
    execute = shellExec,
  } = {}) {
    const view = (spec) =>
      `${
        execute(`npm view ${shellArgumentFactory(spec)} version`, {
          cwd: root,
          silent: true,
          silentOnError: true,
          stdout: true,
          disableLog: true,
        }) ?? ''
      }`
        .trim()
        .split('\n')
        .pop()
        .replace(/^'|'$/g, '');
    return ownPackages.flatMap((name) => {
      const current = packageJson.version ? view(`${name}@${packageJson.version}`) : '';
      const version = current || view(name);
      if (!/^\d+\.\d+\.\d+/.test(version)) return [];
      return [{ name, version, current: version === packageJson.version, purl: `pkg:npm/${name}@${version}` }];
    });
  }

  /**
   * Reads the alerts Socket raises on published packages from the registry analysis of their
   * tarballs: the same per-file alerts, in the same artifact shape, as a full scan's artifacts.
   * @param {object} [options]
   * @param {string} [options.root]
   * @param {Function} [options.execute]
   * @param {object} [options.env]
   * @param {string} [options.binary] - Socket binary; resolved when absent.
   * @param {Array<{purl: string}>} [options.packages] - `publishedPackagesFactory` result.
   * @returns {{ok: boolean, message: string, unavailable: boolean, packages: object[], artifacts: object[]|null}}
   */
  static packageAlerts({
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
    packages = [],
  } = {}) {
    if (packages.length === 0) return { ok: true, message: '', unavailable: false, packages, artifacts: [] };
    const result = SocketSecurityService.runSocket(
      ['package', 'shallow', ...packages.map(({ purl }) => purl), '--json', '--no-banner'],
      { root, execute, env, binary },
    );
    const data = Array.isArray(result.data) ? result.data : result.data?.data;
    return {
      ok: result.ok && Array.isArray(data),
      message: result.message || (result.ok && !Array.isArray(data) ? 'the package lookup returned no packages' : ''),
      unavailable: result.unavailable === true,
      packages,
      artifacts: Array.isArray(data) ? data : null,
    };
  }

  /**
   * Summarizes a `socket patch scan --json` document.
   * @param {object} [data]
   * @returns {{scannedPackages: number, packagesWithPatches: number, freePatches: number, paidPatches: number, canAccessPaidPatches: boolean, available: object[]}}
   */
  static patchScanSummaryFactory(data = {}) {
    const available = (data?.packages ?? [])
      .flatMap((entry) => entry.patches ?? [])
      .map(({ purl, uuid, severity, tier, title, cveIds, ghsaIds }) => ({
        purl,
        uuid,
        severity: `${severity ?? ''}`.toLowerCase(),
        tier,
        title,
        cveIds: cveIds ?? [],
        ghsaIds: ghsaIds ?? [],
      }))
      .sort((a, b) => SocketSecurityService.severityRank(a.severity) - SocketSecurityService.severityRank(b.severity));
    return {
      scannedPackages: data?.scannedPackages ?? 0,
      packagesWithPatches: data?.packagesWithPatches ?? 0,
      freePatches: data?.freePatches ?? 0,
      paidPatches: data?.paidPatches ?? 0,
      canAccessPaidPatches: data?.canAccessPaidPatches === true,
      available,
    };
  }

  /**
   * Chooses the one patch a package version can carry: the manifest records a single patch
   * per PURL, and two patches on the same files cannot both verify. The most severe wins, then
   * the newest, which is the order Socket lists them in.
   * @param {object[]} [available] - `patchScanSummaryFactory().available`.
   * @returns {{selected: object[], skipped: object[]}}
   */
  static patchSelectionFactory(available = []) {
    const selected = new Map();
    const skipped = [];
    for (const patch of available) {
      const chosen = selected.get(patch.purl);
      if (!chosen) selected.set(patch.purl, patch);
      else skipped.push({ ...patch, reason: `one patch per package version: ${chosen.uuid} selected` });
    }
    return { selected: [...selected.values()], skipped };
  }

  /**
   * Scans the installed packages for available Socket patches. Without a token the public
   * patch API answers with the free tier only.
   * @param {{root?: string, execute?: Function, env?: object, binary?: string}} [options]
   * @returns {{ok: boolean, message: string, unavailable: boolean, data: object|null, summary: object}}
   */
  static patchScan({
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
  } = {}) {
    const result = SocketSecurityService.runSocket(
      ['patch', 'scan', '--json', '--yes', ...SocketSecurityService.orgArgsFactory(env)],
      { root, execute, env, binary },
    );
    return {
      ok: result.ok,
      message: result.message,
      unavailable: result.unavailable === true,
      data: result.data,
      summary: SocketSecurityService.patchScanSummaryFactory(result.data),
    };
  }

  /**
   * Downloads one patch into the manifest and applies it.
   * @param {{identifier: string, root?: string, execute?: Function, env?: object, binary?: string}} options
   * @returns {{ok: boolean, message: string, data: object|null}}
   */
  static patchGet({
    identifier,
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
  } = {}) {
    if (!identifier) throw new TypeError('patchGet requires a patch UUID, CVE, GHSA or PURL');
    const result = SocketSecurityService.runSocket(
      ['patch', 'get', identifier, '--yes', '--json', ...SocketSecurityService.orgArgsFactory(env)],
      { root, execute, env, binary },
    );
    return { ok: result.ok, message: result.message, data: result.data };
  }

  /**
   * Applies the patches the manifest records. Idempotent: an applied patch is verified, a
   * package whose version moved is skipped, a checkout without a manifest is a no-op.
   * @param {{root?: string, execute?: Function, env?: object, binary?: string, dryRun?: boolean}} [options]
   * @returns {{ok: boolean, message: string, unavailable: boolean, status: string, patchesApplied: number, alreadyPatched: number, failed: number, results: object[]}}
   */
  static patchApply({
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
    dryRun = false,
  } = {}) {
    const result = SocketSecurityService.runSocket(
      [...SocketSecurityService.PATCH_APPLY_ARGS, '--json', ...(dryRun ? ['--dry-run'] : [])],
      { root, execute, env, binary },
    );
    const data = result.data ?? {};
    return {
      ok: result.ok,
      message: result.message,
      unavailable: result.unavailable === true,
      status: result.unavailable ? 'unavailable' : (data.status ?? 'unknown'),
      patchesApplied: data.patchesApplied ?? 0,
      alreadyPatched: data.alreadyPatched ?? 0,
      failed: data.failed ?? 0,
      results: data.results ?? [],
    };
  }

  /**
   * Reads the patch manifest of a checkout.
   * @param {string} [root]
   * @returns {{path: string, exists: boolean, patches: object[]}}
   */
  static patchManifestFactory(root = process.cwd()) {
    const path = nodePath.join(root, SocketSecurityService.MANIFEST_PATH);
    if (!fs.existsSync(path)) return { path: SocketSecurityService.MANIFEST_PATH, exists: false, patches: [] };
    const { patches = {} } = fs.readJsonSync(path);
    return {
      path: SocketSecurityService.MANIFEST_PATH,
      exists: true,
      patches: Object.entries(patches).map(([purl, patch]) => ({
        purl,
        uuid: patch.uuid,
        tier: patch.tier,
        license: patch.license,
        files: Object.keys(patch.files ?? {}),
        vulnerabilities: Object.entries(patch.vulnerabilities ?? {}).map(([id, vulnerability]) => ({
          id,
          severity: `${vulnerability.severity ?? ''}`.toLowerCase(),
          summary: vulnerability.summary,
          cves: vulnerability.cves ?? [],
        })),
      })),
    };
  }

  /**
   * Installs the `prepare` hook that applies the manifest on every install of the checkout.
   * Idempotent, and it keeps the manifest's key order and indentation.
   * @param {{root?: string, dryRun?: boolean}} [options]
   * @returns {{path: string, prepare: string, changed: boolean}}
   */
  static patchSetup({ root = process.cwd(), dryRun = false } = {}) {
    const path = nodePath.join(root, 'package.json');
    const source = fs.readFileSync(path, 'utf8');
    const manifest = JSON.parse(source);
    const current = `${manifest.scripts?.prepare ?? ''}`.trim();
    const prepare = current.includes(SocketSecurityService.PREPARE_SCRIPT)
      ? current
      : [current, SocketSecurityService.PREPARE_SCRIPT].filter(Boolean).join(' && ');
    const changed = prepare !== current;
    if (changed && !dryRun) {
      manifest.scripts = { ...manifest.scripts, prepare };
      fs.writeFileSync(path, `${JSON.stringify(manifest, null, /^(\s+)"/m.exec(source)?.[1] ?? '  ')}\n`, 'utf8');
    }
    return { path, prepare, changed };
  }

  /**
   * Runs `socket fix`: dependency upgrades that resolve known CVEs, semver-compatible unless
   * `majorUpdates` is set.
   * @param {{root?: string, execute?: Function, env?: object, binary?: string, majorUpdates?: boolean, apply?: boolean, outputFile?: string}} [options]
   * @returns {{ok: boolean, message: string, unavailable: boolean, data: *}}
   */
  static fix({
    root = process.cwd(),
    execute = shellExec,
    env = SocketSecurityService.socketEnvFactory(),
    binary,
    majorUpdates = false,
    apply = true,
    outputFile = '',
  } = {}) {
    const result = SocketSecurityService.runSocket(
      [
        'fix',
        '--json',
        '--no-banner',
        ...(majorUpdates ? [] : ['--no-major-updates']),
        ...(apply ? [] : ['--no-apply-fixes']),
        ...(outputFile ? ['--output-file', outputFile] : []),
      ],
      { root, execute, env, binary, silent: false },
    );
    return { ok: result.ok, message: result.message, unavailable: result.unavailable === true, data: result.data };
  }

  /**
   * The package name and version an npm PURL names.
   * @param {string} [purl]
   * @returns {{name: string, version: string}}
   */
  static purlPackageFactory(purl = '') {
    const [, name = '', version = ''] = /^pkg:npm\/(.+)@([^@]+)$/.exec(`${purl ?? ''}`) ?? [];
    return { name, version };
  }

  /**
   * The GHSA id an advisory URL or id list names.
   * @param {string} [text]
   * @returns {string}
   */
  static ghsaIdFactory(text = '') {
    const match = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i.exec(`${text ?? ''}`)?.[0] ?? '';
    return match.replace(/^ghsa/i, 'GHSA');
  }

  /**
   * The category key of a Socket alert type.
   * @param {string} [type]
   * @returns {string}
   */
  static alertCategoryFactory(type = '') {
    const entry = Object.entries(SocketSecurityService.ALERT_CATEGORIES).find(([, category]) =>
      category.types.includes(type),
    );
    return entry ? entry[0] : 'other';
  }

  /**
   * The package names this project publishes its own code under: the manifest name and the bin
   * names, bare and under the repository owner and organization scopes.
   * @param {object} [params]
   * @param {object} [params.packageJson]
   * @param {string} [params.organization] - `GITHUB_ORG_NAME` otherwise.
   * @returns {string[]}
   */
  static ownPackageNamesFactory({ packageJson = {}, organization = environmentValueFactory('GITHUB_ORG_NAME') } = {}) {
    const repository = `${packageJson.repository?.url ?? packageJson.repository ?? ''}`;
    const owners = [/github\.com[/:]([^/]+)\//.exec(repository)?.[1], organization].filter(Boolean);
    const names = [packageJson.name, ...Object.keys(packageJson.bin ?? {})].filter(Boolean);
    const scoped = [...new Set(owners)].flatMap((owner) => names.map((name) => `@${owner}/${name}`));
    return [...new Set([...names, ...scoped])];
  }

  /**
   * The full package name of a scan artifact.
   * @param {{namespace?: string, name?: string}} [artifact]
   * @returns {string}
   */
  static artifactNameFactory(artifact = {}) {
    const scope = `${artifact.namespace ?? ''}`;
    return scope ? `${scope.startsWith('@') ? scope : `@${scope}`}/${artifact.name}` : `${artifact.name ?? ''}`;
  }

  /**
   * Maps an alert file to this checkout. The npm tarball prefix is dropped, a path that leaves
   * the root is refused, and the `start` offset becomes a line only when the analyzed version is
   * the checked-out one.
   * @param {object} [params]
   * @param {string} [params.root]
   * @param {string} [params.file] - Alert file path.
   * @param {number} [params.start] - Character offset of the alert.
   * @param {boolean} [params.current] - The analyzed version is the checked-out version.
   * @returns {{file: string, line: number|null, local: boolean}}
   */
  static sourceLocationFactory({ root = process.cwd(), file = '', start, current = true } = {}) {
    const path = `${file ?? ''}`.replace(/^package\//, '');
    const base = nodePath.resolve(root);
    const absolute = nodePath.resolve(base, path);
    const inside = Boolean(path) && absolute.startsWith(`${base}${nodePath.sep}`);
    const local = inside && fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    let line = null;
    if (local && current && Number.isInteger(start)) {
      const content = fs.readFileSync(absolute, 'utf8');
      if (start <= content.length) line = content.slice(0, start).split('\n').length;
    }
    return { file: inside ? path : '', line, local };
  }

  /**
   * A finding location as `file:line`, or the package when the alert names no file.
   * @param {{file?: string, line?: number|null, local?: boolean, package?: string, installed?: string}} finding
   * @returns {string}
   */
  static locationLabelFactory(finding = {}) {
    if (!finding.file) return `${finding.package}@${finding.installed}`;
    return `${finding.file}${finding.line ? `:${finding.line}` : ''}${finding.local ? '' : ' (not in this checkout)'}`;
  }

  /**
   * Splits scan artifact alerts into the two report domains. An alert on one of this project's
   * own packages is a source finding with a location; every other alert is a dependency finding,
   * one per package version and alert type.
   * @param {object} [params]
   * @param {object[]} [params.artifacts] - `scan view` artifacts.
   * @param {object[]} [params.policies] - `scanReportSummaryFactory().alerts`, for the policy action.
   * @param {string[]} [params.ownPackages] - `ownPackageNamesFactory` result.
   * @param {string} [params.root]
   * @param {string} [params.version] - Checked-out version.
   * @returns {{dependency: object[], source: object[]}}
   */
  static alertFindingsFactory({
    artifacts = [],
    policies = [],
    ownPackages = [],
    root = process.cwd(),
    version = '',
  } = {}) {
    const { severityRank, SOCKET_SEVERITIES } = SocketSecurityService;
    const own = new Set(ownPackages);
    const policy = new Map(policies.map((alert) => [`${alert.package}@${alert.version}#${alert.type}`, alert.policy]));
    const dependency = new Map();
    const source = new Map();
    for (const artifact of artifacts) {
      const name = SocketSecurityService.artifactNameFactory(artifact);
      for (const alert of artifact.alerts ?? []) {
        const finding = {
          category: SocketSecurityService.alertCategoryFactory(alert.type),
          type: alert.type,
          severity: SOCKET_SEVERITIES[alert.severity] ?? 'info',
          package: name,
          installed: artifact.version,
          policy: policy.get(`${name}@${artifact.version}#${alert.type}`) ?? alert.action ?? '',
        };
        if (!own.has(name)) {
          const key = `${name}@${artifact.version}#${alert.type}`;
          const current = dependency.get(key);
          dependency.set(key, {
            ...finding,
            severity:
              current && severityRank(current.severity) < severityRank(finding.severity)
                ? current.severity
                : finding.severity,
            files: (current?.files ?? 0) + (alert.file ? 1 : 0),
          });
          continue;
        }
        const location = SocketSecurityService.sourceLocationFactory({
          root,
          file: alert.file,
          start: alert.start,
          current: artifact.version === version,
        });
        const key = `${alert.type}#${location.file}#${location.line ?? alert.start ?? ''}#${name}`;
        if (!source.has(key)) source.set(key, { ...finding, ...location });
      }
    }
    const order = Object.keys(SocketSecurityService.ALERT_CATEGORIES);
    const sorted = (findings) =>
      findings.sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          order.indexOf(a.category) - order.indexOf(b.category) ||
          `${a.file ?? ''}${a.package}`.localeCompare(`${b.file ?? ''}${b.package}`) ||
          (a.line ?? 0) - (b.line ?? 0),
      );
    return { dependency: sorted([...dependency.values()]), source: sorted([...source.values()]) };
  }

  /**
   * Findings per severity, with the total.
   * @param {object[]} [findings]
   * @returns {object}
   */
  static severityCountsFactory(findings = []) {
    return {
      ...Object.fromEntries(
        SocketSecurityService.SEVERITIES.map((severity) => [
          severity,
          findings.filter((finding) => finding.severity === severity).length,
        ]),
      ),
      total: findings.length,
    };
  }

  /**
   * Findings per category, in report order, without empty categories.
   * @param {object[]} [findings]
   * @returns {Object<string, number>}
   */
  static categoryCountsFactory(findings = []) {
    return Object.fromEntries(
      Object.keys(SocketSecurityService.ALERT_CATEGORIES)
        .map((category) => [category, findings.filter((finding) => finding.category === category).length])
        .filter(([, count]) => count > 0),
    );
  }

  /**
   * Groups source findings into one refactoring task per category, most severe first.
   * @param {object[]} [findings] - `alertFindingsFactory().source`.
   * @returns {Array<{category: string, label: string, task: string, severity: string, types: string[], locations: string[]}>}
   */
  static sourceTasksFactory(findings = []) {
    const { ALERT_CATEGORIES, severityRank } = SocketSecurityService;
    const tasks = new Map();
    for (const finding of findings) {
      const task = tasks.get(finding.category) ?? {
        category: finding.category,
        label: ALERT_CATEGORIES[finding.category].label,
        task: ALERT_CATEGORIES[finding.category].task,
        severity: finding.severity,
        types: [],
        locations: [],
      };
      if (severityRank(finding.severity) < severityRank(task.severity)) task.severity = finding.severity;
      if (!task.types.includes(finding.type)) task.types.push(finding.type);
      const location = SocketSecurityService.locationLabelFactory(finding);
      if (!task.locations.includes(location)) task.locations.push(location);
      tasks.set(finding.category, task);
    }
    return [...tasks.values()].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }

  /**
   * Merges the dependency sources into one finding per (package, advisory or alert) and assigns
   * each its reachability tier; see {@link SocketSecurityService.REACHABILITY_TIERS}.
   * @param {object} [params]
   * @param {object} [params.npmAudit] - `npmAuditSummaryFactory` result.
   * @param {object} [params.patchScan] - `patchScanSummaryFactory` result.
   * @param {object[]} [params.alerts] - `alertFindingsFactory().dependency`.
   * @param {object} [params.reachability] - `reachabilityFactory` result.
   * @param {object} [params.manifest] - `patchManifestFactory` result.
   * @returns {object[]} Findings, most severe first.
   */
  static findingsFactory({ npmAudit = {}, patchScan = {}, alerts = [], reachability = {}, manifest = {} } = {}) {
    const findings = new Map();
    const merge = (key, finding) => {
      const current = findings.get(key) ?? { sources: [], patches: [] };
      findings.set(key, {
        ...current,
        ...Object.fromEntries(Object.entries(finding).filter(([, value]) => value !== undefined && value !== '')),
        sources: [...new Set([...current.sources, finding.source])],
        patches: [...new Set([...current.patches, ...(finding.patches ?? [])])],
      });
    };
    for (const entry of npmAudit.findings ?? [])
      for (const advisory of entry.advisories) {
        const id = SocketSecurityService.ghsaIdFactory(advisory.url) || advisory.url;
        merge(`${entry.name}#${id}`, {
          package: entry.name,
          id,
          category: 'advisories',
          title: advisory.title,
          severity: advisory.severity,
          range: entry.range,
          direct: entry.direct,
          fix: entry.fix,
          source: 'npm audit',
        });
      }
    for (const patch of patchScan.available ?? []) {
      const { name, version } = SocketSecurityService.purlPackageFactory(patch.purl);
      const id = patch.ghsaIds[0] ?? patch.cveIds[0] ?? patch.uuid;
      merge(`${name}#${id}`, {
        package: name,
        id,
        category: 'advisories',
        title: patch.title,
        severity: patch.severity,
        installed: version,
        patches: [patch.uuid],
        source: 'socket patch',
      });
    }
    for (const alert of alerts)
      merge(`${alert.package}#${alert.type}@${alert.installed}`, {
        package: alert.package,
        id: alert.type,
        category: alert.category,
        severity: alert.severity,
        installed: alert.installed,
        policy: alert.policy,
        files: alert.files,
        source: 'socket scan',
      });

    const evidence = new Map(
      (reachability.results ?? []).map((result) => [`${result.package}#${result.ghsaId}`, result.reachable]),
    );
    const patched = new Set(
      (manifest.patches ?? []).flatMap((patch) =>
        patch.vulnerabilities.map(({ id }) => `${SocketSecurityService.purlPackageFactory(patch.purl).name}#${id}`),
      ),
    );
    return [...findings.entries()]
      .map(([key, finding]) => {
        const reachable = evidence.has(key) ? evidence.get(key) : null;
        const tier = evidence.has(key) ? 1 : finding.sources.includes('socket scan') ? 2 : 3;
        return { ...finding, tier, reachable, fix: finding.fix ?? 'none', patched: patched.has(key) };
      })
      .sort(
        (a, b) =>
          SocketSecurityService.severityRank(a.severity) - SocketSecurityService.severityRank(b.severity) ||
          a.package.localeCompare(b.package),
      );
  }

  /**
   * The findings no non-breaking action resolves, with the reason each one stays.
   * @param {object[]} [findings]
   * @returns {object[]}
   */
  static deferredFactory(findings = []) {
    return findings
      .filter((finding) => !finding.patched && (finding.fix === 'none' || finding.fix.endsWith('(major)')))
      .map((finding) => ({
        package: finding.package,
        id: finding.id,
        severity: finding.severity,
        tier: finding.tier,
        reason: [
          finding.fix === 'none' ? 'no compatible upstream fix' : `the fix is a major upgrade (${finding.fix})`,
          finding.patches.length > 0
            ? `a Socket patch exists (${finding.patches.join(', ')}) but the manifest carries another patch for this package version`
            : 'no Socket patch',
        ].join('; '),
      }));
  }

  /**
   * Assembles the audit report: the shared Socket scan, then the dependency security domain and
   * the source code risk domain; see {@link SocketSecurityService.DOMAINS}.
   * @param {object} params
   * @param {string} [params.root]
   * @param {object} [params.packageJson]
   * @param {string[]} [params.ownPackages] - `ownPackageNamesFactory` result.
   * @param {object} params.dependencies - `auditRuntimeDependencies` result.
   * @param {object} params.npmAudit - `npmAudit` summary.
   * @param {object|null} [params.scan] - `scan` result.
   * @param {object|null} [params.packageAlerts] - `packageAlerts` result.
   * @param {object} params.patchScan - `patchScan` result.
   * @param {object} params.manifest - `patchManifestFactory` result.
   * @param {object} [params.remediation] - Actions this run took, by action name.
   * @param {object} [params.env] - Resolved Socket configuration.
   * @param {string} [params.cliVersion]
   * @returns {object}
   */
  static securityReportFactory({
    root = process.cwd(),
    packageJson = fs.readJsonSync(nodePath.join(root, 'package.json')),
    ownPackages = SocketSecurityService.ownPackageNamesFactory({ packageJson }),
    dependencies,
    npmAudit,
    scan = null,
    packageAlerts = null,
    patchScan,
    manifest,
    remediation = {},
    env = {},
    cliVersion = '',
  }) {
    const { categoryCountsFactory, severityCountsFactory } = SocketSecurityService;
    const alerts = SocketSecurityService.alertFindingsFactory({
      artifacts: [...(scan?.artifacts ?? []), ...(packageAlerts?.artifacts ?? [])],
      policies: scan?.summary.alerts,
      ownPackages,
      root,
      version: packageJson.version,
    });
    const findings = SocketSecurityService.findingsFactory({
      npmAudit,
      patchScan: patchScan.summary,
      alerts: alerts.dependency,
      reachability: scan?.reachability,
      manifest,
    });
    const skipped = env.token ? 'not requested' : `${SocketSecurityService.ENV.token} is not set`;
    return {
      generatedAt: new Date().toISOString(),
      package: { name: packageJson.name, version: packageJson.version },
      socket: {
        cli: cliVersion || 'not installed',
        token: Boolean(env.token),
        org: env.orgSlug || '',
        acceptRisks: Boolean(env.acceptRisks),
      },
      scan: scan
        ? {
            ok: scan.ok,
            message: scan.message,
            unavailable: scan.unavailable,
            healthy: scan.summary.healthy,
            scanId: scan.summary.scanId,
            orgSlug: scan.summary.orgSlug,
            url: scan.summary.url,
            artifacts: scan.artifacts?.length ?? 0,
          }
        : { skipped },
      dependencySecurity: {
        segregation: dependencies,
        npmAudit,
        reachability: scan?.reachability ?? SocketSecurityService.reachabilityFactory(null),
        patches: {
          scan: {
            ok: patchScan.ok,
            message: patchScan.message,
            unavailable: patchScan.unavailable,
            ...patchScan.summary,
          },
          manifest,
        },
        remediation,
        categories: categoryCountsFactory(findings),
        counts: severityCountsFactory(findings),
        findings,
        deferred: SocketSecurityService.deferredFactory(findings),
      },
      sourceCodeRisk: {
        status: !packageAlerts
          ? `skipped: ${skipped}`
          : packageAlerts.packages.length === 0
            ? 'unavailable: no own package is published to the registry'
            : packageAlerts.artifacts
              ? 'analyzed'
              : `unavailable: ${packageAlerts.message}`,
        packages: ownPackages,
        analyzed: (packageAlerts?.packages ?? []).map(({ name, version, current }) => ({ name, version, current })),
        categories: categoryCountsFactory(alerts.source),
        counts: severityCountsFactory(alerts.source),
        tasks: SocketSecurityService.sourceTasksFactory(alerts.source),
        findings: alerts.source,
      },
      counts: severityCountsFactory([...findings, ...alerts.source]),
    };
  }

  /**
   * Renders a Markdown table.
   * @param {string[]} headers
   * @param {Array<Array<*>>} rows
   * @returns {string}
   */
  static markdownTable(headers, rows) {
    const cell = (value) => `${value ?? ''}`.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    return [
      `| ${headers.join(' | ')} |`,
      `| ${headers.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
    ].join('\n');
  }

  /**
   * Renders the report as Markdown.
   * @param {object} report - `securityReportFactory` result.
   * @returns {string}
   */
  static securityReportMarkdownFactory(report) {
    const { ALERT_CATEGORIES, DOMAINS, REACHABILITY_TIERS, SEVERITIES, markdownTable: table } = SocketSecurityService;
    const { dependencySecurity: dependency, sourceCodeRisk: source } = report;
    const yesNo = (value) => (value ? 'yes' : 'no');
    const reachable = (value) => (value === true ? 'reachable' : value === false ? 'unreachable' : 'n/a');
    const label = (category) => ALERT_CATEGORIES[category]?.label ?? category;
    const severityRow = (name, counts) => [name, ...SEVERITIES.map((severity) => counts[severity]), counts.total];
    const categories = (counts) =>
      Object.keys(counts).length > 0
        ? [
            table(
              ['Category', 'Findings'],
              Object.entries(counts).map(([category, count]) => [label(category), count]),
            ),
            '',
          ]
        : [];
    const remediationRows = Object.entries(dependency.remediation).flatMap(([action, result]) =>
      (Array.isArray(result) ? (result.length > 0 ? result : [{ status: 'nothing to do' }]) : [result]).map((entry) => [
        action,
        entry.purl ?? entry.uuid ?? '',
        entry.skipped
          ? `skipped: ${entry.skipped}`
          : entry.ok === false
            ? `failed: ${entry.message}`
            : (entry.status ?? 'ok'),
        [
          entry.patchesApplied !== undefined && `applied ${entry.patchesApplied}`,
          entry.alreadyPatched !== undefined && `already patched ${entry.alreadyPatched}`,
          entry.failed ? `failed ${entry.failed}` : '',
          entry.code !== undefined && `exit ${entry.code}`,
        ]
          .filter(Boolean)
          .join(', '),
      ]),
    );
    const sections = [
      `# Security audit: ${report.package.name} ${report.package.version}`,
      '',
      `Generated ${report.generatedAt}.`,
      '',
      '## Summary',
      '',
      table(
        ['Domain', ...SEVERITIES, 'Total'],
        [
          severityRow('Dependency security', dependency.counts),
          severityRow('Source code risk', source.counts),
          severityRow('Total', report.counts),
        ],
      ),
      '',
      table(
        ['Setting', 'Value'],
        [
          ['Socket CLI', report.socket.cli],
          [SocketSecurityService.ENV.token, yesNo(report.socket.token)],
          [SocketSecurityService.ENV.orgSlug, report.socket.org || 'not set'],
          [SocketSecurityService.ENV.acceptRisks, yesNo(report.socket.acceptRisks)],
        ],
      ),
      '',
      '## Socket scan',
      '',
      report.scan.skipped
        ? `Skipped: ${report.scan.skipped}.`
        : table(
            ['Field', 'Value'],
            [
              ['Healthy', report.scan.healthy === null ? 'unknown' : yesNo(report.scan.healthy)],
              ['Scan', report.scan.url || report.scan.scanId || 'none'],
              ['Artifacts', report.scan.artifacts],
              ['Message', report.scan.message || 'none'],
            ],
          ),
      '',
      '## Dependency Security',
      '',
      DOMAINS.dependency,
      '',
      '### Findings',
      '',
      ...categories(dependency.categories),
      dependency.findings.length > 0
        ? table(
            ['Severity', 'Category', 'Package', 'Advisory or alert', 'Tier', 'Reachability', 'Fix', 'Patch', 'Sources'],
            dependency.findings.map((finding) => [
              finding.severity,
              label(finding.category),
              `${finding.package}${finding.installed ? `@${finding.installed}` : ''}`,
              finding.id,
              finding.tier,
              reachable(finding.reachable),
              finding.fix,
              finding.patched
                ? 'applied'
                : finding.patches.length > 0
                  ? `available ${finding.patches.join(' ')}`
                  : 'none',
              finding.sources.join(', '),
            ]),
          )
        : 'No findings.',
      '',
      '### Segregation',
      '',
      table(
        ['Group', 'Count'],
        [
          ['dependencies', dependency.segregation.dependencies],
          ['devDependencies', dependency.segregation.devDependencies],
          ['packages the runtime graph imports', dependency.segregation.runtime.length],
        ],
      ),
      '',
      dependency.segregation.misplaced.length > 0
        ? table(
            ['Runtime import outside dependencies', 'Declared in', 'Importers'],
            dependency.segregation.misplaced.map(({ name, declaredIn, importers }) => [
              name,
              declaredIn,
              importers.join(', '),
            ]),
          )
        : 'Every package the runtime graph imports is declared in `dependencies`.',
      '',
      `Lazy imports: ${dependency.segregation.lazy.join(', ') || 'none'}.`,
      '',
      '### npm audit',
      '',
      table(
        [...SEVERITIES, 'Total'],
        [[...SEVERITIES.map((severity) => dependency.npmAudit.counts[severity]), dependency.npmAudit.counts.total]],
      ),
      '',
      dependency.npmAudit.findings.length > 0
        ? table(
            ['Package', 'Severity', 'Range', 'Direct', 'Fix', 'Advisories'],
            dependency.npmAudit.findings.map((finding) => [
              finding.name,
              finding.severity,
              finding.range,
              yesNo(finding.direct),
              finding.fix,
              finding.advisories.map((advisory) => advisory.url).join(' '),
            ]),
          )
        : 'No known vulnerabilities in the lockfile.',
      '',
      '### Reachability',
      '',
      table(
        ['Tier', 'Meaning'],
        Object.entries(REACHABILITY_TIERS).map(([tier, meaning]) => [tier, meaning]),
      ),
      '',
      dependency.reachability.available
        ? table(
            ['Package', 'Version', 'Advisory', 'Result'],
            dependency.reachability.results.map((result) => [
              result.package,
              result.version,
              result.ghsaId,
              reachable(result.reachable),
            ]),
          )
        : 'Tier 1 analysis not run: `underpost socketsecurity --audit --reach` needs a Socket API token.',
      '',
      '### Socket patches',
      '',
      table(
        ['Field', 'Value'],
        [
          ['Scanned packages', dependency.patches.scan.scannedPackages],
          ['Packages with patches', dependency.patches.scan.packagesWithPatches],
          ['Free patches', dependency.patches.scan.freePatches],
          ['Paid patches', dependency.patches.scan.paidPatches],
          ['Paid tier access', yesNo(dependency.patches.scan.canAccessPaidPatches)],
          [
            'Status',
            dependency.patches.scan.message || (dependency.patches.scan.unavailable ? 'CLI not installed' : 'ok'),
          ],
        ],
      ),
      '',
      dependency.patches.scan.available.length > 0
        ? table(
            ['Severity', 'PURL', 'UUID', 'Tier', 'Title'],
            dependency.patches.scan.available.map((patch) => [
              patch.severity,
              patch.purl,
              patch.uuid,
              patch.tier,
              patch.title,
            ]),
          )
        : 'No patch available for the installed versions.',
      '',
      `Manifest \`${dependency.patches.manifest.path}\`: ${dependency.patches.manifest.exists ? `${dependency.patches.manifest.patches.length} patch(es)` : 'absent'}.`,
      '',
      ...(dependency.patches.manifest.patches.length > 0
        ? [
            table(
              ['PURL', 'UUID', 'Tier', 'Vulnerabilities', 'Files'],
              dependency.patches.manifest.patches.map((patch) => [
                patch.purl,
                patch.uuid,
                patch.tier,
                patch.vulnerabilities
                  .map((vulnerability) => `${vulnerability.id} (${vulnerability.severity})`)
                  .join(' '),
                patch.files.length,
              ]),
            ),
            '',
          ]
        : []),
      '### Remediation',
      '',
      remediationRows.length > 0
        ? table(['Action', 'Target', 'Result', 'Details'], remediationRows)
        : 'No remediation ran in this pass.',
      '',
      '### Deferred risks',
      '',
      dependency.deferred.length > 0
        ? table(
            ['Severity', 'Package', 'Advisory or alert', 'Tier', 'Reason'],
            dependency.deferred.map((entry) => [entry.severity, entry.package, entry.id, entry.tier, entry.reason]),
          )
        : 'None.',
      '',
      '## Source Code Risk Analysis',
      '',
      DOMAINS.source,
      '',
      table(
        ['Field', 'Value'],
        [
          ['Status', source.status],
          ['Own packages', source.packages.join(', ') || 'none'],
          [
            'Analyzed',
            source.analyzed
              .map(
                ({ name, version, current }) => `${name}@${version}${current ? '' : ' (not the checked-out version)'}`,
              )
              .join(', ') || 'none',
          ],
        ],
      ),
      '',
      '### Refactoring tasks',
      '',
      source.tasks.length > 0
        ? table(
            ['Severity', 'Category', 'Task', 'Alerts', 'Locations'],
            source.tasks.map((task) => [
              task.severity,
              task.label,
              task.task,
              task.types.join(', '),
              task.locations.join(', '),
            ]),
          )
        : 'No source code alerts.',
      '',
      '### Findings',
      '',
      ...categories(source.categories),
      source.findings.length > 0
        ? table(
            ['Severity', 'Category', 'Alert', 'Location', 'Package', 'Policy'],
            source.findings.map((finding) => [
              finding.severity,
              label(finding.category),
              finding.type,
              SocketSecurityService.locationLabelFactory(finding),
              `${finding.package}@${finding.installed}`,
              finding.policy || 'none',
            ]),
          )
        : 'No findings.',
      '',
    ];
    return sections.join('\n');
  }

  /**
   * Writes the report and the raw documents behind it.
   * @param {object} params
   * @param {object} params.report - `securityReportFactory` result.
   * @param {Record<string, object|null>} [params.artifacts] - Raw documents by `REPORT_FILES` key.
   * @param {string} [params.directory] - Output directory.
   * @returns {string[]} Files written.
   */
  static writeSecurityReports({ report, artifacts = {}, directory = SocketSecurityService.REPORT_DIRECTORY }) {
    const { REPORT_FILES } = SocketSecurityService;
    fs.ensureDirSync(directory);
    const files = [];
    const write = (file, content) => {
      const path = nodePath.join(directory, file);
      fs.writeFileSync(path, content, 'utf8');
      files.push(path);
    };
    write(REPORT_FILES.report, `${JSON.stringify(report, null, 2)}\n`);
    write(REPORT_FILES.markdown, SocketSecurityService.securityReportMarkdownFactory(report));
    for (const [key, document] of Object.entries(artifacts))
      if (document !== null && document !== undefined && REPORT_FILES[key])
        write(REPORT_FILES[key], `${JSON.stringify(document, null, 2)}\n`);
    logger.info('Security reports written', { directory, files: files.map((file) => nodePath.basename(file)) });
    return files;
  }

  /**
   * Whether the Socket scan failed or broke the policy, or findings at or above a severity remain
   * in either domain.
   * @param {object} report - `securityReportFactory` result.
   * @param {string} [threshold]
   * @returns {boolean}
   */
  static reportViolates(report, threshold = 'high') {
    const limit = SocketSecurityService.severityRank(threshold);
    const findings = [...(report.dependencySecurity?.findings ?? []), ...(report.sourceCodeRisk?.findings ?? [])];
    return (
      report.scan?.ok === false ||
      report.scan?.healthy === false ||
      findings.some((finding) => SocketSecurityService.severityRank(finding.severity) <= limit)
    );
  }
}

const {
  SEVERITIES,
  alertCategoryFactory,
  alertFindingsFactory,
  artifactNameFactory,
  categoryCountsFactory,
  childEnvFactory,
  deferredFactory,
  findingsFactory,
  fix,
  ghsaIdFactory,
  locationLabelFactory,
  npmAudit,
  npmAuditFix,
  npmAuditSummaryFactory,
  orgArgsFactory,
  ownPackageNamesFactory,
  packageAlerts,
  parseJsonOutput,
  patchApply,
  patchGet,
  patchManifestFactory,
  patchScan,
  patchScanSummaryFactory,
  patchSelectionFactory,
  patchSetup,
  publishedPackagesFactory,
  purlPackageFactory,
  reachabilityFactory,
  reportViolates,
  runSocket,
  scan,
  scanReportSummaryFactory,
  securityReportFactory,
  securityReportMarkdownFactory,
  severityCountsFactory,
  socketBinaryFactory,
  socketCommandFactory,
  socketEnvFactory,
  socketResultFactory,
  socketVersion,
  sourceLocationFactory,
  sourceTasksFactory,
  writeSecurityReports,
} = SocketSecurityService;

export default SocketSecurityService;

export {
  SEVERITIES,
  alertCategoryFactory,
  alertFindingsFactory,
  artifactNameFactory,
  categoryCountsFactory,
  childEnvFactory,
  deferredFactory,
  findingsFactory,
  fix,
  ghsaIdFactory,
  locationLabelFactory,
  npmAudit,
  npmAuditFix,
  npmAuditSummaryFactory,
  orgArgsFactory,
  ownPackageNamesFactory,
  packageAlerts,
  parseJsonOutput,
  patchApply,
  patchGet,
  patchManifestFactory,
  patchScan,
  patchScanSummaryFactory,
  patchSelectionFactory,
  patchSetup,
  publishedPackagesFactory,
  purlPackageFactory,
  reachabilityFactory,
  reportViolates,
  runSocket,
  scan,
  scanReportSummaryFactory,
  securityReportFactory,
  securityReportMarkdownFactory,
  severityCountsFactory,
  socketBinaryFactory,
  socketCommandFactory,
  socketEnvFactory,
  socketResultFactory,
  socketVersion,
  sourceLocationFactory,
  sourceTasksFactory,
  writeSecurityReports,
};
