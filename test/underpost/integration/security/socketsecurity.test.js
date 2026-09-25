'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import SocketSecurityService, {
  SEVERITIES,
  alertCategoryFactory,
  alertFindingsFactory,
  publishedPackagesFactory,
  packageAlerts,
  artifactNameFactory,
  categoryCountsFactory,
  childEnvFactory,
  deferredFactory,
  findingsFactory,
  ghsaIdFactory,
  locationLabelFactory,
  npmAuditSummaryFactory,
  orgArgsFactory,
  ownPackageNamesFactory,
  parseJsonOutput,
  patchApply,
  patchManifestFactory,
  patchScan,
  patchScanSummaryFactory,
  patchSelectionFactory,
  patchSetup,
  purlPackageFactory,
  reachabilityFactory,
  reportViolates,
  runSocket,
  scan,
  scanReportSummaryFactory,
  securityReportFactory,
  securityReportMarkdownFactory,
  severityCountsFactory,
  socketCommandFactory,
  socketEnvFactory,
  socketResultFactory,
  sourceLocationFactory,
  sourceTasksFactory,
  writeSecurityReports,
} from '../../../../src/server/security/socketsecurity.js';

const tempRoot = () => fs.mkdtempSync(nodePath.join(os.tmpdir(), 'socketsecurity-'));

// An executor that answers every command with one result and records what it was asked.
const executorFactory = (result = { code: 0, stdout: '', stderr: '' }) => {
  const calls = [];
  const execute = (command, options = {}) => {
    calls.push({ command, options });
    return options.stdout ? result.stdout : result;
  };
  return { calls, execute };
};

const npmAuditFixture = {
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 },
    dependencies: { prod: 10, dev: 3, total: 13 },
  },
  vulnerabilities: {
    minimist: {
      name: 'minimist',
      severity: 'moderate',
      isDirect: false,
      via: [
        {
          title: 'Prototype Pollution in minimist',
          url: 'https://github.com/advisories/GHSA-xvch-5gv4-984h',
          severity: 'moderate',
          range: '<1.2.6',
          cwe: ['CWE-1321'],
        },
      ],
      range: '<1.2.6',
      fixAvailable: { name: 'tool', version: '9.0.0', isSemVerMajor: true },
    },
    axios: {
      name: 'axios',
      severity: 'high',
      isDirect: true,
      via: [
        {
          title: 'Server-Side Request Forgery in axios',
          url: 'https://github.com/advisories/GHSA-8hc4-vh64-cxmj',
          severity: 'high',
          range: '<=1.7.3',
        },
        'follow-redirects',
      ],
      range: '<=1.7.3',
      fixAvailable: true,
    },
  },
};

const patchScanFixture = {
  canAccessPaidPatches: false,
  freePatches: 2,
  paidPatches: 0,
  scannedPackages: 40,
  packagesWithPatches: 2,
  status: 'success',
  totalPatches: 2,
  packages: [
    {
      purl: 'pkg:npm/semver@7.3.5',
      patches: [
        {
          cveIds: ['CVE-2022-25883'],
          ghsaIds: ['GHSA-c2qf-rxjj-qqgw'],
          purl: 'pkg:npm/semver@7.3.5',
          severity: 'MODERATE',
          tier: 'free',
          title: 'semver vulnerable to Regular Expression Denial of Service',
          uuid: 'bef9d52f-74ea-4eb0-9992-86e981170794',
        },
      ],
    },
    {
      purl: 'pkg:npm/axios@1.7.3',
      patches: [
        {
          cveIds: ['CVE-2024-39338'],
          ghsaIds: ['GHSA-8hc4-vh64-cxmj'],
          purl: 'pkg:npm/axios@1.7.3',
          severity: 'HIGH',
          tier: 'free',
          title: 'Server-Side Request Forgery in axios',
          uuid: '211d430d-caac-46a9-9303-eb257430429c',
        },
      ],
    },
  ],
};

const scanReportFixture = {
  healthy: false,
  orgSlug: 'acme',
  scanId: '000aaaa1-0000-0a0a-00a0-00a0000000a0',
  options: { fold: 'version', reportLevel: 'warn' },
  alerts: {
    npm: {
      'left-pad': {
        '1.3.0': {
          type: 'installScripts',
          policy: 'error',
          url: 'https://socket.dev/npm/package/left-pad',
          manifest: ['package.json'],
        },
      },
      axios: {
        '1.7.3': {
          type: 'cve',
          policy: 'warn',
          url: 'https://socket.dev/npm/package/axios',
          manifest: ['package-lock.json'],
        },
      },
    },
  },
};

const factsFixture = {
  tier1ReachabilityScanId: 'reach-1',
  components: [
    {
      name: 'axios',
      version: '1.7.3',
      reachability: [{ ghsa_id: 'GHSA-8hc4-vh64-cxmj', reachability: [{ type: 'reachable', workspacePath: '.' }] }],
    },
    {
      name: 'minimist',
      version: '1.2.5',
      reachability: [
        { ghsa_id: 'GHSA-xvch-5gv4-984h', reachability: [{ type: 'unreachable', workspacePath: '.' }] },
        { ghsa_id: 'GHSA-vh95-rmgr-6w4m', reachability: [{ type: 'error', workspacePath: '.' }] },
      ],
    },
  ],
};

const manifestFixture = {
  patches: {
    'pkg:npm/axios@1.7.3': {
      uuid: '211d430d-caac-46a9-9303-eb257430429c',
      files: { 'package/lib/adapters/http.js': { beforeHash: 'a', afterHash: 'b' } },
      vulnerabilities: {
        'GHSA-8hc4-vh64-cxmj': { cves: ['CVE-2024-39338'], summary: 'SSRF in axios', severity: 'HIGH' },
      },
      license: 'MIT',
      tier: 'free',
    },
  },
};

const PROBE_SOURCE = 'const a = 1;\nconst b = 2;\nconst key = process.env.KEY;\n';

// A checkout whose own package is published as `probe` and `@acme/probe`.
const probeRoot = () => {
  const root = tempRoot();
  fs.outputFileSync(nodePath.join(root, 'src/cli/probe.js'), PROBE_SOURCE);
  return root;
};
const OWN_PACKAGES = ['probe', '@acme/probe'];

const artifactsFixture = [
  {
    type: 'npm',
    name: 'left-pad',
    version: '1.3.0',
    alerts: [{ type: 'installScripts', severity: 'high', file: 'package/package.json' }],
  },
  {
    type: 'npm',
    name: 'axios',
    version: '1.7.3',
    alerts: [
      { type: 'cve', severity: 'high', file: 'package/lib/adapters/http.js' },
      { type: 'networkAccess', severity: 'low', file: 'package/lib/a.js' },
      { type: 'networkAccess', severity: 'middle', file: 'package/lib/b.js' },
    ],
  },
  {
    type: 'npm',
    namespace: '@acme',
    name: 'probe',
    version: '1.0.0',
    alerts: [
      { type: 'envVars', severity: 'low', file: 'package/src/cli/probe.js', start: PROBE_SOURCE.indexOf('process') },
      { type: 'urlStrings', severity: 'middle', file: 'package/src/client/public/app.js', start: 5 },
      { type: 'gptSecurity', severity: 'high', file: 'src/cli/probe.js', start: 0 },
      { type: 'filesystemAccess', severity: 'low', file: 'package/../../etc/passwd', start: 0 },
    ],
  },
  {
    type: 'npm',
    name: 'probe',
    version: '0.9.0',
    alerts: [{ type: 'shellAccess', severity: 'critical', file: 'package/src/cli/probe.js', start: 12 }],
  },
];

describe('Socket security configuration', () => {
  it('provides one canonical class API with named aliases', () => {
    expect(SocketSecurityService.socketEnvFactory).to.equal(socketEnvFactory);
    expect(SocketSecurityService.runSocket).to.equal(runSocket);
    expect(SocketSecurityService.SEVERITIES).to.equal(SEVERITIES);
    expect(SocketSecurityService.PREPARE_SCRIPT).to.equal('node bin socketsecurity --patch-apply');
  });

  it('resolves the three Socket variables through the environment reader', () => {
    const values = { SOCKET_CLI_API_TOKEN: 'sktsec_x', SOCKET_CLI_ORG_SLUG: 'acme', SOCKET_CLI_ACCEPT_RISKS: '1' };
    expect(socketEnvFactory((key) => values[key] ?? '')).to.deep.equal({
      token: 'sktsec_x',
      orgSlug: 'acme',
      acceptRisks: '1',
    });
    expect(socketEnvFactory(() => '')).to.deep.equal({ token: '', orgSlug: '', acceptRisks: '' });
  });

  it('forwards only the values that are set into the child environment', () => {
    const env = childEnvFactory({ token: 'sktsec_x', orgSlug: '', acceptRisks: '' }, { PATH: '/usr/bin' });
    expect(env).to.deep.equal({ PATH: '/usr/bin', SOCKET_CLI_API_TOKEN: 'sktsec_x' });
    expect(orgArgsFactory({ orgSlug: 'acme' })).to.deep.equal(['--org', 'acme']);
    expect(orgArgsFactory({})).to.deep.equal([]);
  });
});

describe('Socket command execution', () => {
  it('quotes every argument of a command line', () => {
    expect(socketCommandFactory(['patch', 'get', "it's"], { binary: '/x/.bin/socket' })).to.equal(
      "'/x/.bin/socket' 'patch' 'get' 'it'\\''s'",
    );
  });

  it('parses the JSON document after the lines printed before it', () => {
    expect(parseJsonOutput('No SOCKET_API_TOKEN set.\n{\n  "status": "success"\n}\n')).to.deep.equal({
      status: 'success',
    });
    expect(parseJsonOutput('[1, 2]')).to.deep.equal([1, 2]);
    expect(parseJsonOutput('nothing here')).to.equal(null);
  });

  it('normalizes the CLI envelope and the patch status objects', () => {
    expect(socketResultFactory({ code: 0, stdout: '{"ok":true,"data":{"id":"s1"}}' })).to.deep.equal({
      ok: true,
      code: 0,
      data: { id: 's1' },
      message: '',
    });
    expect(
      socketResultFactory({ code: 1, stdout: '{"ok":false,"message":"Auth Error","cause":"no token"}' }),
    ).to.include({
      ok: false,
      message: 'Auth Error: no token',
    });
    expect(socketResultFactory({ code: 0, stdout: '{"status":"no_manifest"}' })).to.include({ ok: true });
    expect(socketResultFactory({ code: 0, stdout: '{"status":"error","error":"Manifest not found"}' })).to.include({
      ok: false,
      message: 'Manifest not found',
    });
    expect(socketResultFactory({ code: 2, stdout: '', stderr: 'boom\nlast line' })).to.include({
      ok: false,
      message: 'last line',
    });
  });

  it('reports an absent CLI without executing anything', () => {
    const { calls, execute } = executorFactory();
    const result = runSocket(['patch', 'list'], { root: '/nowhere', execute, binary: '' });
    expect(result).to.include({ ok: false, unavailable: true, code: 127 });
    expect(calls).to.be.empty;
  });

  it('runs in the checkout with the token in the environment, never on the command line', () => {
    const { calls, execute } = executorFactory({ code: 0, stdout: '{"ok":true,"data":{}}' });
    const env = { token: 'sktsec_secret', orgSlug: 'acme', acceptRisks: '' };
    const result = runSocket(['scan', 'create', '--json'], { root: '/repo', execute, env, binary: '/bin/socket' });
    expect(result.ok).to.equal(true);
    expect(calls).to.have.length(1);
    expect(calls[0].command).to.equal("'/bin/socket' 'scan' 'create' '--json'");
    expect(calls[0].command).to.not.include('sktsec_secret');
    expect(calls[0].options).to.include({ cwd: '/repo', silentOnError: true, silent: true });
    expect(calls[0].options.env).to.include({ SOCKET_CLI_API_TOKEN: 'sktsec_secret', SOCKET_CLI_ORG_SLUG: 'acme' });
  });
});

describe('npm audit summary', () => {
  it('orders findings by severity and labels the fix each one has', () => {
    const summary = npmAuditSummaryFactory(npmAuditFixture);
    expect(summary.counts).to.include({ high: 1, moderate: 1, total: 2 });
    expect(summary.dependencies).to.deep.equal({ prod: 10, dev: 3, total: 13 });
    expect(summary.findings.map(({ name }) => name)).to.deep.equal(['axios', 'minimist']);
    expect(summary.findings[0]).to.include({ direct: true, fix: 'update' });
    expect(summary.findings[0].via).to.deep.equal(['follow-redirects']);
    expect(summary.findings[1].fix).to.equal('tool@9.0.0 (major)');
    expect(summary.findings[1].advisories[0].cwe).to.deep.equal(['CWE-1321']);
  });

  it('summarizes an empty document as a clean audit', () => {
    expect(npmAuditSummaryFactory({})).to.deep.equal({
      counts: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
      dependencies: {},
      findings: [],
    });
  });
});

describe('Socket scan and reachability', () => {
  it('flattens the folded policy report into one row per alert', () => {
    const summary = scanReportSummaryFactory(scanReportFixture);
    expect(summary).to.include({
      healthy: false,
      scanId: scanReportFixture.scanId,
      url: `https://socket.dev/dashboard/org/acme/sbom/${scanReportFixture.scanId}`,
    });
    expect(summary.alerts).to.have.length(2);
    expect(summary.alerts[0]).to.include({ ecosystem: 'npm', package: 'left-pad', version: '1.3.0', policy: 'error' });
    expect(scanReportSummaryFactory(null)).to.include({ healthy: null, url: '' });
  });

  it('reads the reachability facts into reachable, unreachable and undetermined results', () => {
    const reachability = reachabilityFactory(factsFixture);
    expect(reachability).to.include({ available: true, analyzed: 2 });
    expect(reachability.counts).to.deep.equal({ reachable: 1, unreachable: 1, undetermined: 1 });
    expect(reachability.results.map(({ reachable }) => reachable)).to.deep.equal([true, false, null]);
    expect(reachabilityFactory(null)).to.include({ available: false, analyzed: 0 });
  });

  it('creates the scan, reads its artifacts, and consumes the facts file the reachability scan leaves behind', () => {
    const root = tempRoot();
    const factsPath = nodePath.join(root, SocketSecurityService.FACTS_PATH);
    const results = [
      { code: 1, stdout: JSON.stringify({ ok: true, data: scanReportFixture }) },
      { code: 0, stdout: JSON.stringify({ ok: true, data: artifactsFixture }) },
    ];
    const calls = [];
    // A leftover facts file would be taken as pre-generated input, so it must be gone by the time the CLI runs.
    fs.writeJsonSync(factsPath, { components: [] });
    const execute = (command, options) => {
      calls.push({ command, options, staleFacts: fs.existsSync(factsPath) });
      if (calls.length === 1) fs.writeJsonSync(factsPath, factsFixture);
      return results[calls.length - 1];
    };
    const result = scan({
      root,
      execute,
      env: { token: 'sktsec_x', orgSlug: 'acme' },
      reach: true,
      binary: '/bin/socket',
    });
    expect(calls[0].staleFacts).to.equal(false);
    expect(calls[0].command).to.include("'--report-level' 'defer'");
    expect(calls[0].command).to.include("'--reach' '--reach-retain-facts-file'");
    expect(calls[0].command).to.include("'--org' 'acme' '.'");
    expect(calls[0].options.silent).to.equal(false);
    expect(calls[1].command).to.equal(
      `'/bin/socket' 'scan' 'view' '${scanReportFixture.scanId}' '--json' '--no-banner' '--org' 'acme'`,
    );
    expect(result).to.include({ ok: true });
    expect(result.summary.healthy).to.equal(false);
    expect(result.artifacts).to.deep.equal(artifactsFixture);
    expect(result.reachability.counts.reachable).to.equal(1);
    expect(result.facts).to.deep.equal(factsFixture);
    expect(fs.existsSync(factsPath)).to.equal(false);
    fs.removeSync(root);
  });

  it('reports a scan whose artifacts cannot be read as failed', () => {
    const results = [
      { code: 0, stdout: JSON.stringify({ ok: true, data: scanReportFixture }) },
      { code: 1, stdout: JSON.stringify({ ok: false, message: 'Scan results not ready', cause: 'retry' }) },
    ];
    let call = 0;
    const result = scan({ root: tempRoot(), execute: () => results[call++], env: {}, binary: '/bin/socket' });
    expect(result).to.include({ ok: false, message: 'Scan results not ready: retry', artifacts: null });
  });

  it('resolves own packages to the checked-out version when it is published, the latest otherwise', () => {
    const published = {
      "'probe@1.0.0'": '',
      "'probe'": '0.9.0',
      "'@acme/probe@1.0.0'": '1.0.0',
      "'@acme/probe'": '1.0.0',
    };
    const calls = [];
    const execute = (command, options) => {
      calls.push({ command, options });
      return published[command.replace(/^npm view (.*) version$/, '$1')] ?? '';
    };
    const packages = publishedPackagesFactory({
      packageJson: { version: '1.0.0' },
      ownPackages: [...OWN_PACKAGES, 'unpublished'],
      root: '/repo',
      execute,
    });
    expect(packages).to.deep.equal([
      { name: 'probe', version: '0.9.0', current: false, purl: 'pkg:npm/probe@0.9.0' },
      { name: '@acme/probe', version: '1.0.0', current: true, purl: 'pkg:npm/@acme/probe@1.0.0' },
    ]);
    expect(calls.every(({ options }) => options.cwd === '/repo' && options.stdout === true)).to.equal(true);
  });

  it('reads the registry alerts on the published packages in the scan artifact shape', () => {
    const own = artifactsFixture.filter((artifact) => OWN_PACKAGES.includes(artifactNameFactory(artifact)));
    const { calls, execute } = executorFactory({ code: 0, stdout: JSON.stringify({ ok: true, data: own }) });
    const packages = [{ name: 'probe', version: '1.0.0', current: true, purl: 'pkg:npm/probe@1.0.0' }];
    const result = packageAlerts({
      root: '/repo',
      execute,
      env: { token: 'sktsec_x' },
      binary: '/bin/socket',
      packages,
    });
    expect(calls[0].command).to.equal("'/bin/socket' 'package' 'shallow' 'pkg:npm/probe@1.0.0' '--json' '--no-banner'");
    expect(result).to.deep.include({ ok: true, message: '', packages, artifacts: own });

    const failed = executorFactory({ code: 1, stdout: JSON.stringify({ ok: false, message: 'Not found' }) });
    expect(packageAlerts({ execute: failed.execute, env: {}, binary: '/bin/socket', packages })).to.include({
      ok: false,
      message: 'Not found',
      artifacts: null,
    });

    const idle = executorFactory();
    expect(packageAlerts({ execute: idle.execute, env: {}, binary: '/bin/socket', packages: [] })).to.deep.include({
      ok: true,
      artifacts: [],
    });
    expect(idle.calls).to.have.length(0);
  });
});

describe('Alert domains', () => {
  it('names the own packages from the manifest, the bin map, the repository owner and the organization', () => {
    expect(
      ownPackageNamesFactory({
        packageJson: {
          name: 'underpost-engine',
          bin: { underpost: 'bin/index.js' },
          repository: { url: 'git+https://github.com/underpostnet/engine.git' },
        },
        organization: 'underpost',
      }),
    ).to.deep.equal([
      'underpost-engine',
      'underpost',
      '@underpostnet/underpost-engine',
      '@underpostnet/underpost',
      '@underpost/underpost-engine',
      '@underpost/underpost',
    ]);
    expect(ownPackageNamesFactory({ packageJson: { name: 'probe' }, organization: '' })).to.deep.equal(['probe']);
  });

  it('classifies alert types into one category table, and names scoped artifacts', () => {
    expect(alertCategoryFactory('envVars')).to.equal('envVars');
    expect(alertCategoryFactory('urlStrings')).to.equal('network');
    expect(alertCategoryFactory('usesEval')).to.equal('debugAccess');
    expect(alertCategoryFactory('installScripts')).to.equal('installScripts');
    expect(alertCategoryFactory('criticalCVE')).to.equal('advisories');
    expect(alertCategoryFactory('somethingNew')).to.equal('other');
    const types = Object.values(SocketSecurityService.ALERT_CATEGORIES).flatMap((category) => category.types);
    expect(types).to.have.lengthOf(new Set(types).size);
    expect(artifactNameFactory({ namespace: '@acme', name: 'probe' })).to.equal('@acme/probe');
    expect(artifactNameFactory({ namespace: 'acme', name: 'probe' })).to.equal('@acme/probe');
    expect(artifactNameFactory({ name: 'probe' })).to.equal('probe');
  });

  it('maps an alert file onto the checkout, refusing a path that leaves it', () => {
    const root = probeRoot();
    const start = PROBE_SOURCE.indexOf('process');
    expect(sourceLocationFactory({ root, file: 'package/src/cli/probe.js', start })).to.deep.equal({
      file: 'src/cli/probe.js',
      line: 3,
      local: true,
    });
    expect(sourceLocationFactory({ root, file: 'src/cli/probe.js', start, current: false })).to.deep.equal({
      file: 'src/cli/probe.js',
      line: null,
      local: true,
    });
    expect(sourceLocationFactory({ root, file: 'src/cli/probe.js', start: 10_000 }).line).to.equal(null);
    expect(sourceLocationFactory({ root, file: 'src/gone.js', start: 0 })).to.deep.equal({
      file: 'src/gone.js',
      line: null,
      local: false,
    });
    expect(sourceLocationFactory({ root, file: 'package/../../etc/passwd', start: 0 })).to.deep.equal({
      file: '',
      line: null,
      local: false,
    });
    expect(locationLabelFactory({ file: 'src/a.js', line: 4, local: true })).to.equal('src/a.js:4');
    expect(locationLabelFactory({ file: 'src/a.js', line: null, local: false })).to.equal(
      'src/a.js (not in this checkout)',
    );
    expect(locationLabelFactory({ file: '', package: '@acme/probe', installed: '1.0.0' })).to.equal(
      '@acme/probe@1.0.0',
    );
    fs.removeSync(root);
  });

  it('splits artifact alerts into dependency findings per package version and source findings per location', () => {
    const root = probeRoot();
    const { dependency, source } = alertFindingsFactory({
      artifacts: artifactsFixture,
      policies: scanReportSummaryFactory(scanReportFixture).alerts,
      ownPackages: OWN_PACKAGES,
      root,
      version: '1.0.0',
    });
    expect(dependency).to.deep.equal([
      {
        category: 'advisories',
        type: 'cve',
        severity: 'high',
        package: 'axios',
        installed: '1.7.3',
        policy: 'warn',
        files: 1,
      },
      {
        category: 'installScripts',
        type: 'installScripts',
        severity: 'high',
        package: 'left-pad',
        installed: '1.3.0',
        policy: 'error',
        files: 1,
      },
      {
        category: 'network',
        type: 'networkAccess',
        severity: 'moderate',
        package: 'axios',
        installed: '1.7.3',
        policy: '',
        files: 2,
      },
    ]);
    expect(source.map((finding) => [finding.severity, finding.type, locationLabelFactory(finding)])).to.deep.equal([
      ['critical', 'shellAccess', 'src/cli/probe.js'],
      ['high', 'gptSecurity', 'src/cli/probe.js:1'],
      ['moderate', 'urlStrings', 'src/client/public/app.js (not in this checkout)'],
      ['low', 'envVars', 'src/cli/probe.js:3'],
      ['low', 'filesystemAccess', '@acme/probe@1.0.0'],
    ]);
    expect(source[0]).to.include({ package: 'probe', installed: '0.9.0', category: 'shell' });
    fs.removeSync(root);
  });

  it('groups source findings into one refactoring task per category', () => {
    const root = probeRoot();
    const { source } = alertFindingsFactory({
      artifacts: artifactsFixture,
      ownPackages: OWN_PACKAGES,
      root,
      version: '1.0.0',
    });
    const tasks = sourceTasksFactory(source);
    expect(tasks.map(({ category, severity, locations }) => [category, severity, locations])).to.deep.equal([
      ['shell', 'critical', ['src/cli/probe.js']],
      ['codeAnomaly', 'high', ['src/cli/probe.js:1']],
      ['network', 'moderate', ['src/client/public/app.js (not in this checkout)']],
      ['envVars', 'low', ['src/cli/probe.js:3']],
      ['filesystem', 'low', ['@acme/probe@1.0.0']],
    ]);
    expect(tasks[3].task).to.include('environmentValueFactory');
    expect(tasks[3].types).to.deep.equal(['envVars']);
    expect(categoryCountsFactory(source)).to.deep.equal({
      codeAnomaly: 1,
      envVars: 1,
      filesystem: 1,
      network: 1,
      shell: 1,
    });
    expect(severityCountsFactory(source)).to.deep.equal({
      critical: 1,
      high: 1,
      moderate: 1,
      low: 2,
      info: 0,
      total: 5,
    });
    fs.removeSync(root);
  });
});

describe('Socket patches', () => {
  it('lists the available patches most severe first', () => {
    const summary = patchScanSummaryFactory(patchScanFixture);
    expect(summary).to.include({ scannedPackages: 40, freePatches: 2, canAccessPaidPatches: false });
    expect(summary.available.map(({ purl, severity }) => [purl, severity])).to.deep.equal([
      ['pkg:npm/axios@1.7.3', 'high'],
      ['pkg:npm/semver@7.3.5', 'moderate'],
    ]);
    expect(patchScanSummaryFactory(null).available).to.deep.equal([]);
  });

  it('keeps one patch per package version, the most severe then the newest', () => {
    const available = patchScanSummaryFactory({
      packages: [
        {
          purl: 'pkg:npm/axios@1.7.3',
          patches: [
            { purl: 'pkg:npm/axios@1.7.3', uuid: 'newest-moderate', severity: 'MODERATE', tier: 'free' },
            { purl: 'pkg:npm/axios@1.7.3', uuid: 'newest-high', severity: 'HIGH', tier: 'free' },
            { purl: 'pkg:npm/axios@1.7.3', uuid: 'older-high', severity: 'HIGH', tier: 'free' },
          ],
        },
        { purl: 'pkg:npm/ws@8.16.0', patches: [{ purl: 'pkg:npm/ws@8.16.0', uuid: 'ws-1', severity: 'HIGH' }] },
      ],
    }).available;
    const { selected, skipped } = patchSelectionFactory(available);
    expect(selected.map(({ uuid }) => uuid)).to.deep.equal(['newest-high', 'ws-1']);
    expect(skipped.map(({ uuid, reason }) => `${uuid}: ${reason}`)).to.deep.equal([
      'older-high: one patch per package version: newest-high selected',
      'newest-moderate: one patch per package version: newest-high selected',
    ]);
    expect(patchSelectionFactory([])).to.deep.equal({ selected: [], skipped: [] });
  });

  it('scans and applies through the CLI with the organization when one is set', () => {
    const { calls, execute } = executorFactory({ code: 0, stdout: JSON.stringify(patchScanFixture) });
    const scanned = patchScan({ root: '/repo', execute, env: { orgSlug: 'acme' }, binary: '/bin/socket' });
    expect(calls[0].command).to.equal("'/bin/socket' 'patch' 'scan' '--json' '--yes' '--org' 'acme'");
    expect(scanned.summary.available).to.have.length(2);

    const apply = executorFactory({ code: 0, stdout: '{"status":"no_manifest","patchesApplied":0,"results":[]}' });
    const applied = patchApply({ root: '/repo', execute: apply.execute, env: {}, dryRun: true, binary: '/bin/socket' });
    expect(apply.calls[0].command).to.equal("'/bin/socket' 'patch' 'apply' '--ecosystems' 'npm' '--json' '--dry-run'");
    expect(applied).to.include({ ok: true, status: 'no_manifest', patchesApplied: 0, failed: 0 });

    const partial = executorFactory({
      code: 1,
      stdout: JSON.stringify({
        status: 'partial_failure',
        failed: 1,
        alreadyPatched: 1,
        patchesApplied: 0,
        results: [
          { purl: 'pkg:npm/semver@7.3.5', error: null },
          {
            purl: 'pkg:npm/ws@8.16.0',
            error: 'Cannot apply patch: lib/websocket-server.js - File hash does not match',
          },
        ],
      }),
      stderr: 'No SOCKET_API_TOKEN set. Using public patch API proxy (free patches only).',
    });
    expect(patchApply({ root: '/repo', execute: partial.execute, env: {}, binary: '/bin/socket' })).to.include({
      ok: false,
      status: 'partial_failure',
      failed: 1,
      message: 'Cannot apply patch: lib/websocket-server.js - File hash does not match',
    });
    expect(patchApply({ root: '/repo', execute, env: {}, binary: '' })).to.include({
      unavailable: true,
      status: 'unavailable',
    });
  });

  it('reads the manifest a checkout carries', () => {
    const root = tempRoot();
    expect(patchManifestFactory(root)).to.deep.equal({ path: '.socket/manifest.json', exists: false, patches: [] });
    fs.outputJsonSync(nodePath.join(root, SocketSecurityService.MANIFEST_PATH), manifestFixture);
    const manifest = patchManifestFactory(root);
    expect(manifest.exists).to.equal(true);
    expect(manifest.patches[0]).to.deep.include({
      purl: 'pkg:npm/axios@1.7.3',
      uuid: '211d430d-caac-46a9-9303-eb257430429c',
      tier: 'free',
      files: ['package/lib/adapters/http.js'],
    });
    expect(manifest.patches[0].vulnerabilities[0]).to.deep.equal({
      id: 'GHSA-8hc4-vh64-cxmj',
      severity: 'high',
      summary: 'SSRF in axios',
      cves: ['CVE-2024-39338'],
    });
    fs.removeSync(root);
  });

  it('installs the prepare hook once and keeps the manifest layout', () => {
    const root = tempRoot();
    const path = nodePath.join(root, 'package.json');
    fs.writeFileSync(
      path,
      '{\n    "name": "probe",\n    "scripts": {\n        "test": "echo ok"\n    },\n    "version": "1.0.0"\n}\n',
    );

    expect(patchSetup({ root, dryRun: true })).to.include({
      changed: true,
      prepare: 'node bin socketsecurity --patch-apply',
    });
    expect(JSON.parse(fs.readFileSync(path, 'utf8')).scripts.prepare).to.equal(undefined);

    expect(patchSetup({ root }).changed).to.equal(true);
    const written = fs.readFileSync(path, 'utf8');
    expect(Object.keys(JSON.parse(written))).to.deep.equal(['name', 'scripts', 'version']);
    expect(written).to.include('        "prepare": "node bin socketsecurity --patch-apply"');
    expect(patchSetup({ root })).to.include({ changed: false });

    fs.writeJsonSync(path, { name: 'probe', scripts: { prepare: 'node scripts/own.js' } });
    expect(patchSetup({ root }).prepare).to.equal('node scripts/own.js && node bin socketsecurity --patch-apply');
    fs.removeSync(root);
  });
});

describe('Alert policy', () => {
  it('reads the policy action an artifact alert carries when the policy report left it out', () => {
    const { dependency } = alertFindingsFactory({
      artifacts: [
        { name: 'left-pad', version: '1.3.0', alerts: [{ type: 'gptAnomaly', severity: 'middle', action: 'ignore' }] },
      ],
    });
    expect(dependency[0]).to.include({ type: 'gptAnomaly', severity: 'moderate', policy: 'ignore' });
  });
});

describe('Security report', () => {
  const npmAudit = npmAuditSummaryFactory(npmAuditFixture);
  const patches = patchScanSummaryFactory(patchScanFixture);
  const scanSummary = scanReportSummaryFactory(scanReportFixture);
  const reachability = reachabilityFactory(factsFixture);
  const dependencyAlerts = () =>
    alertFindingsFactory({ artifacts: artifactsFixture, policies: scanSummary.alerts, ownPackages: OWN_PACKAGES })
      .dependency;

  it('extracts advisory ids and PURL coordinates', () => {
    expect(ghsaIdFactory('https://github.com/advisories/GHSA-8hc4-vh64-cxmj')).to.equal('GHSA-8hc4-vh64-cxmj');
    expect(ghsaIdFactory('CVE-2024-1')).to.equal('');
    expect(purlPackageFactory('pkg:npm/@grpc/grpc-js@1.14.4')).to.deep.equal({
      name: '@grpc/grpc-js',
      version: '1.14.4',
    });
    expect(purlPackageFactory('pkg:pypi/requests@2.0.0')).to.deep.equal({ name: '', version: '' });
  });

  it('merges the dependency sources into one finding per advisory or alert and assigns reachability tiers', () => {
    const root = tempRoot();
    fs.outputJsonSync(nodePath.join(root, SocketSecurityService.MANIFEST_PATH), manifestFixture);
    const manifest = patchManifestFactory(root);
    fs.removeSync(root);

    const findings = findingsFactory({
      npmAudit,
      patchScan: patches,
      alerts: dependencyAlerts(),
      reachability,
      manifest,
    });
    const axios = findings.find(({ package: name, id }) => name === 'axios' && id === 'GHSA-8hc4-vh64-cxmj');
    expect(axios).to.include({
      category: 'advisories',
      severity: 'high',
      tier: 1,
      reachable: true,
      fix: 'update',
      installed: '1.7.3',
      patched: true,
    });
    expect(axios.sources).to.deep.equal(['npm audit', 'socket patch']);
    expect(axios.patches).to.deep.equal(['211d430d-caac-46a9-9303-eb257430429c']);

    const minimist = findings.find(({ package: name }) => name === 'minimist');
    expect(minimist).to.include({ tier: 1, reachable: false, fix: 'tool@9.0.0 (major)', patched: false });

    const semver = findings.find(({ package: name }) => name === 'semver');
    expect(semver).to.include({ tier: 3, reachable: null, fix: 'none', patched: false });

    const leftPad = findings.find(({ package: name }) => name === 'left-pad');
    expect(leftPad).to.include({
      tier: 2,
      severity: 'high',
      policy: 'error',
      id: 'installScripts',
      category: 'installScripts',
    });
    const network = findings.find(({ id }) => id === 'networkAccess');
    expect(network).to.include({ category: 'network', severity: 'moderate', files: 2, tier: 2 });
    // The own package never reaches the dependency domain.
    expect(findings.map(({ package: name }) => name)).to.not.include.members(OWN_PACKAGES);
    expect(findings[0].severity).to.equal('high');
    expect(findings.at(-1).severity).to.equal('moderate');
  });

  it('defers what no non-breaking action resolves, with the reason', () => {
    const findings = findingsFactory({ npmAudit, patchScan: patches, alerts: dependencyAlerts(), reachability });
    const deferred = deferredFactory(findings);
    // A scan alert carries its alert type, not an advisory id, so it cannot merge with an advisory.
    expect(deferred.map(({ package: name, id }) => `${name}#${id}`)).to.deep.equal([
      'axios#cve',
      'left-pad#installScripts',
      'axios#networkAccess',
      'minimist#GHSA-xvch-5gv4-984h',
      'semver#GHSA-c2qf-rxjj-qqgw',
    ]);
    expect(deferred[1].reason).to.equal('no compatible upstream fix; no Socket patch');
    expect(deferred[3].reason).to.equal('the fix is a major upgrade (tool@9.0.0 (major)); no Socket patch');
    expect(deferred[4].reason).to.equal(
      'no compatible upstream fix; a Socket patch exists (bef9d52f-74ea-4eb0-9992-86e981170794) but the manifest carries another patch for this package version',
    );
    expect(deferredFactory([])).to.deep.equal([]);
  });

  it('assembles, renders and writes the report with a section per domain', () => {
    const root = probeRoot();
    const own = (artifact) => OWN_PACKAGES.includes(artifactNameFactory(artifact));
    const scanArtifacts = artifactsFixture.filter((artifact) => !own(artifact));
    const report = securityReportFactory({
      root,
      packageJson: { name: 'probe', version: '1.0.0' },
      ownPackages: OWN_PACKAGES,
      dependencies: {
        dependencies: 3,
        devDependencies: 2,
        runtime: ['axios', 'vitest'],
        lazy: ['bumpp (devDependencies)'],
        misplaced: [{ name: 'vitest', declaredIn: 'devDependencies', importers: ['src/cli/test.js'] }],
      },
      npmAudit,
      scan: {
        ok: true,
        message: '',
        unavailable: false,
        summary: scanSummary,
        artifacts: scanArtifacts,
        report: scanReportFixture,
        facts: factsFixture,
        reachability,
      },
      packageAlerts: {
        ok: true,
        message: '',
        unavailable: false,
        packages: [{ name: 'probe', version: '1.0.0', current: true, purl: 'pkg:npm/probe@1.0.0' }],
        artifacts: artifactsFixture.filter(own),
      },
      patchScan: { ok: true, message: '', unavailable: false, data: patchScanFixture, summary: patches },
      manifest: patchManifestFactory(root),
      remediation: {
        'npm audit fix': { ok: true, code: 0 },
        'socket patch get': [{ uuid: 'u1', purl: 'pkg:npm/axios@1.7.3', ok: true, message: '' }],
        'socket fix': { skipped: 'SOCKET_CLI_API_TOKEN is not set' },
        'socket patch apply': { ok: true, status: 'success', patchesApplied: 1, alreadyPatched: 0, failed: 0 },
      },
      env: { token: 'sktsec_x', orgSlug: 'acme', acceptRisks: '' },
      cliVersion: '1.1.171',
    });

    expect(report.socket).to.deep.equal({ cli: '1.1.171', token: true, org: 'acme', acceptRisks: false });
    expect(report.scan).to.include({ ok: true, healthy: false, orgSlug: 'acme', artifacts: scanArtifacts.length });
    const { dependencySecurity: dependency, sourceCodeRisk: source } = report;
    expect(dependency.counts).to.include({ high: 3, moderate: 3, total: 6 });
    expect(dependency.categories).to.deep.equal({ advisories: 4, installScripts: 1, network: 1 });
    expect(dependency.deferred).to.have.length(5);
    expect(dependency.remediation['npm audit fix']).to.deep.equal({ ok: true, code: 0 });
    expect(source).to.include({ status: 'analyzed' });
    expect(source.analyzed).to.deep.equal([{ name: 'probe', version: '1.0.0', current: true }]);
    expect(source.packages).to.deep.equal(OWN_PACKAGES);
    expect(source.counts).to.include({ critical: 1, high: 1, moderate: 1, low: 2, total: 5 });
    expect(source.tasks).to.have.length(5);
    expect(report.counts).to.include({ critical: 1, high: 4, moderate: 4, low: 2, total: 11 });

    expect(reportViolates(report)).to.equal(true);
    expect(reportViolates({ scan: { ok: true, healthy: true }, dependencySecurity: { findings: [] } })).to.equal(false);
    expect(reportViolates({ scan: { ok: false }, dependencySecurity: { findings: [] } })).to.equal(true);
    // A source finding gates the run like a dependency finding.
    expect(
      reportViolates({ scan: { healthy: true }, sourceCodeRisk: { findings: [{ severity: 'critical' }] } }),
    ).to.equal(true);
    expect(
      reportViolates({ scan: { healthy: true }, dependencySecurity: { findings: [{ severity: 'low' }] } }, 'moderate'),
    ).to.equal(false);

    const markdown = securityReportMarkdownFactory(report);
    for (const expected of [
      '# Security audit: probe 1.0.0',
      '| Dependency security | 0 | 3 | 3 | 0 | 0 | 6 |',
      '| Source code risk | 1 | 1 | 1 | 2 | 0 | 5 |',
      '## Socket scan',
      `sbom/${scanReportFixture.scanId}`,
      '## Dependency Security',
      '| Install scripts and native code | 1 |',
      '| high | Install scripts and native code | left-pad@1.3.0 | installScripts |',
      '### Segregation',
      '| vitest | devDependencies | src/cli/test.js |',
      '### npm audit',
      '### Reachability',
      '| axios | 1.7.3 | GHSA-8hc4-vh64-cxmj | reachable |',
      '### Socket patches',
      '### Remediation',
      '| socket patch get | pkg:npm/axios@1.7.3 | ok |',
      '| socket fix |  | skipped: SOCKET_CLI_API_TOKEN is not set |',
      '### Deferred risks',
      '## Source Code Risk Analysis',
      '| Own packages | probe, @acme/probe |',
      '| Analyzed | probe@1.0.0 |',
      '### Refactoring tasks',
      '| critical | Shell access |',
      'src/cli/probe.js:3',
      '| moderate | Network access and embedded URLs | urlStrings | src/client/public/app.js (not in this checkout) | @acme/probe@1.0.0 | none |',
    ])
      expect(markdown, expected).to.include(expected);
    expect(markdown.indexOf('## Dependency Security')).to.be.lessThan(markdown.indexOf('## Source Code Risk Analysis'));

    const directory = nodePath.join(root, 'out');
    const files = writeSecurityReports({
      report,
      directory,
      artifacts: {
        npmAudit: npmAuditFixture,
        scan: scanReportFixture,
        scanArtifacts: scanArtifacts,
        packageAlerts: artifactsFixture.filter(own),
        reach: factsFixture,
        patchScan: null,
      },
    });
    expect(files.map((file) => nodePath.basename(file))).to.deep.equal([
      'security-report.json',
      'security-report.md',
      'npm-audit.json',
      'socket-scan.json',
      'socket-scan-artifacts.json',
      'socket-package-alerts.json',
      'socket-reach.json',
    ]);
    const written = fs.readJsonSync(nodePath.join(directory, 'security-report.json'));
    expect(Object.keys(written)).to.include.members(['scan', 'dependencySecurity', 'sourceCodeRisk', 'counts']);
    expect(written.sourceCodeRisk.findings).to.have.length(5);
    fs.removeSync(root);
  });

  it('reports a skipped scan, and a skipped source analysis, when no token is configured', () => {
    const report = securityReportFactory({
      packageJson: { name: 'probe', version: '1.0.0' },
      ownPackages: ['probe'],
      dependencies: { dependencies: 0, devDependencies: 0, runtime: [], lazy: [], misplaced: [] },
      npmAudit: npmAuditSummaryFactory({}),
      patchScan: { ok: false, message: '', unavailable: true, data: null, summary: patchScanSummaryFactory(null) },
      manifest: { path: '.socket/manifest.json', exists: false, patches: [] },
    });
    expect(report.scan).to.deep.equal({ skipped: 'SOCKET_CLI_API_TOKEN is not set' });
    expect(report.dependencySecurity.reachability.available).to.equal(false);
    expect(report.sourceCodeRisk).to.include({ status: 'skipped: SOCKET_CLI_API_TOKEN is not set' });
    expect(report.sourceCodeRisk.findings).to.deep.equal([]);
    const markdown = securityReportMarkdownFactory(report);
    expect(markdown).to.include('Skipped: SOCKET_CLI_API_TOKEN is not set.');
    expect(markdown).to.include('| Status | CLI not installed |');
    expect(markdown).to.include('No remediation ran in this pass.');
    expect(markdown).to.include('No source code alerts.');
  });

  it('reports the source analysis as unavailable when the package lookup fails or nothing is published', () => {
    const report = securityReportFactory({
      packageJson: { name: 'probe', version: '1.0.0' },
      ownPackages: ['probe'],
      dependencies: { dependencies: 0, devDependencies: 0, runtime: [], lazy: [], misplaced: [] },
      npmAudit: npmAuditSummaryFactory({}),
      scan: {
        ok: false,
        message: 'Scan results not ready',
        unavailable: false,
        summary: scanSummary,
        artifacts: null,
        reachability: reachabilityFactory(null),
      },
      packageAlerts: {
        ok: false,
        message: 'Package not found',
        unavailable: false,
        packages: [{ name: 'probe', version: '1.0.0', current: true, purl: 'pkg:npm/probe@1.0.0' }],
        artifacts: null,
      },
      patchScan: { ok: true, message: '', unavailable: false, data: null, summary: patchScanSummaryFactory(null) },
      manifest: { path: '.socket/manifest.json', exists: false, patches: [] },
      env: { token: 'sktsec_x' },
    });
    expect(report.sourceCodeRisk.status).to.equal('unavailable: Package not found');
    const unpublished = securityReportFactory({
      packageJson: { name: 'probe', version: '1.0.0' },
      ownPackages: ['probe'],
      dependencies: { dependencies: 0, devDependencies: 0, runtime: [], lazy: [], misplaced: [] },
      npmAudit: npmAuditSummaryFactory({}),
      packageAlerts: { ok: true, message: '', unavailable: false, packages: [], artifacts: [] },
      patchScan: { ok: true, message: '', unavailable: false, data: null, summary: patchScanSummaryFactory(null) },
      manifest: { path: '.socket/manifest.json', exists: false, patches: [] },
      env: { token: 'sktsec_x' },
    });
    expect(unpublished.sourceCodeRisk.status).to.equal('unavailable: no own package is published to the registry');
    expect(report.scan.artifacts).to.equal(0);
    expect(reportViolates(report, 'critical')).to.equal(true);
  });
});
