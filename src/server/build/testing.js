/**
 * The test contract: which domain owns a behaviour, which level verifies it, the
 * order the projects run in, and the in-cluster surfaces that execute and report
 * them.
 *
 * The filesystem is the taxonomy: `test/<domain>/<level>/` says who owns a test.
 * This table is the execution policy: it says when that test runs, what coverage
 * it measures and which source change selects it. A gateway assertion that fails
 * because SELinux denied a bind is a security failure reported at the ingress
 * layer, so the lower project has to have run — and passed — before the higher
 * one is worth reading. Vitest expresses that with an ascending
 * `sequence.groupOrder`; nothing outside this table decides what runs when.
 *
 * This module is pure: it renders the runner configuration, the execution plan,
 * the argument vector and the manifests from values it is given. Resolving deploy
 * configuration, spawning the runner and talking to the cluster belong to
 * `src/cli/test.js`.
 *
 * @module src/server/build/testing.js
 * @namespace UnderpostTesting
 */

/**
 * @constant UNDERPOST_TESTING
 * @description Identity of the test execution and reporting surfaces. One
 * dashboard serves every deploy on the cluster, so these names are cluster-wide
 * constants rather than per-deploy.
 * @memberof UnderpostTesting
 */
const UNDERPOST_TESTING = {
  coverageDirectory: 'coverage',
  lcovPath: 'coverage/lcov.info',
  // Minimum total line coverage a gated run must reach — the same metric Coveralls
  // reports, so a green build and a green badge mean the same thing. It is a
  // ratchet: the floor the measured surface already holds (85% for the platform
  // tiers, 85% with cyberia), raised as suites land, never a target no run meets.
  // `COVERAGE_MIN` moves it for one repository without moving it for every one.
  coverageThreshold: 80,
  // Read by vitest.config.js to decide whether the Allure reporter is attached.
  // Absent means a plain local run, so no result files are written at all.
  allureResultsEnvKey: 'UNDERPOST_ALLURE_RESULTS',
  allureResultsDirectory: 'allure-results',
  // Read by vitest.config.js: the footprint every project of a child run applies.
  footprintEnvKey: 'UNDERPOST_TEST_FOOTPRINT',
  // Read by vitest.config.js: the blob file a batch writes its results and coverage to.
  batchReportEnvKey: 'UNDERPOST_TEST_REPORT',
  runs: {
    directory: '.vitest/test-runs',
    // Holds only blobs, because the merge reads every file in it.
    reportDirectory: 'blobs',
    // Runs on disk, the new run included. A run holds raw coverage, so keep few.
    kept: 5,
    // Time a batch gets to stop after SIGTERM, before SIGKILL.
    terminationGraceMs: 10000,
  },
  allure: {
    name: 'allure',
    image: 'frankescobar/allure-docker-service:2.27.0',
    port: 5050,
    nodePort: 32350,
    pvcName: 'allure-pvc',
    pvcStorage: '2Gi',
    resultsPath: '/app/allure-results',
    reportsPath: '/app/default-reports',
    routeName: 'allure-route',
    // Sub-path under an existing hostname, so the dashboard rides the edge
    // certificate already issued for that host instead of needing one of its own.
    subPath: '/allure',
    // Reports are rebuilt from the results directory on this cadence, which is
    // how a Job that finishes after the page is open still shows up.
    checkResultsEverySeconds: 5,
    keepHistory: true,
  },
  job: {
    namePrefix: 'underpost-test',
    // A test run is a diagnostic, not a workload: a crash loop would hide the
    // failure it is meant to report.
    restartPolicy: 'Never',
    backoffLimit: 0,
    ttlSecondsAfterFinished: 3600,
    workingDirectory: '/home/dd/engine',
  },
};

/**
 * @constant TEST_DOMAINS
 * @description The ecosystem domains a test can belong to, in reading order.
 *
 * A domain owns a body of behaviour, and every test that verifies that behaviour
 * lives under `test/<id>/`. `Ecosystem` owns nothing of its own: it owns the
 * relationships between the others.
 * @memberof UnderpostTesting
 */
const TEST_DOMAINS = Object.freeze({
  underpost: 'Engineering platform: shared CLI, infrastructure, delivery and operational behaviour.',
  'object-layer': 'Canonical Object Layer registry and protocol: identity, lifecycle, render and purge.',
  'item-ledger': 'On-chain Object Layer registry: registration, indexing, ownership and provenance.',
  cyberia: 'Cyberia runtime, Game Studio, engine and CLI: content, instances, releases and atlases.',
  cryptokoyn: 'CKY finance hub: wallet surface, account record and signature identity.',
  ecosystem: 'Cross-domain contracts and the integration boundaries between domains.',
});

/** Every domain: what an unmapped or global change has to be tested against. */
const ALL_DOMAINS = Object.keys(TEST_DOMAINS);

/**
 * @constant TEST_LEVELS
 * @description What a level guarantees. The level is the second classification: the
 * domain says who owns the behaviour, the level says which boundary is exercised.
 * @memberof UnderpostTesting
 */
const TEST_LEVELS = Object.freeze({
  unit: 'Business logic with every collaborator in memory. No database, process, network or browser.',
  integration: 'One real boundary: a database, a spawned process, a served API, an external binary.',
  contract: 'The interface between independently owned components, verified from both sides.',
  e2e: 'A complete externally meaningful workflow, through a real browser or a running server.',
  audit: 'Platform, security and operational invariants over the whole tree.',
});

/**
 * @constant TEST_PROJECTS
 * @description Every runnable project, in execution order.
 *
 * `name` is `<domain>:<level>`, and `<domain>:<level>:<area>` where a level runs
 * in ordered areas. It doubles as the Vitest project id and as the selector, so
 * `--suite cyberia` and `--suite underpost:integration` need no second table:
 * a selector matches a name exactly, or matches the segment prefix before `:`.
 *
 * `groupOrder` is what the batches and Vitest sequence on: lower values run to
 * completion first. Equal values run in parallel only in the `ci` footprint. It
 * starts at 1, never 0 — Vitest routes a project left on the default 0 with a
 * single worker into a bucket it appends after every ordered group, which would
 * run the first project last.
 *
 * `parallel` lets the files of one project run at the same time. A project whose
 * suites bind a port, drive a database, spawn a process or read the deploy tree
 * leaves it off and runs its files one at a time.
 *
 * A project with a `delegate` runs on its own runner instead of as a Vitest
 * project, after the Vitest run — so a delegated project belongs in the last
 * group, where the order it is declared in still matches the order it runs in.
 *
 * A project whose directory a product catalog strips from the base template
 * belongs to that product, and runs only in that product's context: see
 * `runnableTestProjects`.
 *
 * `sources` are the modules the project's suites drive directly, and they are
 * what coverage is measured over when the project is selected. A module reached
 * only as a collaborator — everything the `src/index.js` barrel pulls in behind
 * one CLI call, everything a suite spawns into its own process — belongs to
 * whichever project asserts against it, or to none: counting it here reports a
 * floor no test in the selection can move. A delegated project declares none,
 * because its runner reports its own coverage.
 * @memberof UnderpostTesting
 */
const TEST_PROJECTS = [
  {
    name: 'underpost:audit',
    directory: 'test/underpost/audit',
    groupOrder: 1,
    sources: ['src/server/build/package.js'],
    description:
      'Whole-engine checks that bundle the tree: they run alone, before every other project, so their ' +
      'cost is measured against the host and not against other suites.',
  },
  {
    name: 'underpost:unit',
    directory: 'test/underpost/unit',
    groupOrder: 2,
    parallel: true,
    sources: [
      'underpost.config.js',
      'src/cli/release.js',
      'src/client-builder/build-manifest.js',
      'src/client-builder/client-build-docs.js',
      'src/client/components/core/BuildManifest.js',
      'src/projects/underpost/*.js',
      'src/runtime/nginx/Nginx.js',
      'src/server/build/docs.js',
      'src/server/ops/logger.js',
      'src/server/runtime/conf.js',
      'src/server/storage/cache.js',
    ],
    description: 'Platform logic: configuration, build, release, delivery and operational helpers.',
  },
  {
    name: 'object-layer:unit',
    directory: 'test/object-layer/unit',
    groupOrder: 2,
    parallel: true,
    sources: [
      'src/api/object-layer/object-layer.identity.js',
      'src/api/object-layer/object-layer.model.js',
      'src/client/components/objectlayer-studio/ObjectLayerProtocol.js',
    ],
    description: 'Canonical identity, the definition lifecycle, render answers and the purge path.',
  },
  {
    name: 'item-ledger:unit',
    directory: 'test/item-ledger/unit',
    groupOrder: 2,
    parallel: true,
    sources: [
      'src/api/item-ledger/item-ledger.indexer.js',
      'src/api/item-ledger/item-ledger.model.js',
      'src/api/item-ledger-balance/item-ledger-balance.model.js',
      'src/api/item-ledger-transfer/item-ledger-transfer.model.js',
    ],
    description: 'Registration records, ledger projections and the indexer that builds them.',
  },
  {
    name: 'cyberia:unit',
    directory: 'test/cyberia/unit',
    groupOrder: 2,
    parallel: true,
    sources: [
      'src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js',
      'src/api/cyberia-content-release/cyberia-content-release.model.js',
      'src/api/cyberia-server-defaults/*.js',
      'src/projects/cyberia/compose-stack.js',
      'src/projects/cyberia/content-artifact.js',
      'src/projects/cyberia/content-release.js',
      'src/projects/cyberia/domain-ownership.js',
      'src/projects/cyberia/instance-backup.js',
      'src/projects/cyberia/instance-data.js',
      'src/projects/cyberia/local-stack.js',
      'src/projects/cyberia/map-preview-generator.js',
      'src/projects/cyberia/object-layer-catalog.js',
      'src/projects/cyberia/release-content.js',
      'src/projects/cyberia/server-key.js',
      'src/projects/cyberia/shape-generator.js',
      'src/projects/cyberia/stat-balance.js',
    ],
    description:
      'Cyberia content artifact consumption, instance data, releases, sprite atlases, map previews, stats ' +
      'and shape generation. The suites that run a world need a built cyberia-content artifact ' +
      '(CYBERIA_CONTENT_ROOT or ./cyberia-content) and skip without one.',
  },
  {
    name: 'cryptokoyn:unit',
    directory: 'test/cryptokoyn/unit',
    groupOrder: 2,
    parallel: true,
    sources: [
      'src/api/wallet-account/wallet-account.model.js',
      'src/client/components/wallet/EmbeddedWallet.js',
      'src/client/components/wallet/WalletProvider.js',
      'src/server/security/siwe.js',
      'src/server/security/typed-data.js',
    ],
    description: 'Wallet identity: provider choice, the embedded vault, signatures and the account record.',
  },
  {
    name: 'ecosystem:contract',
    directory: 'test/ecosystem/contract',
    groupOrder: 3,
    parallel: true,
    sources: ['src/server/build/docs.js', 'src/server/domain/*.js'],
    description:
      'The interfaces between domains: the versioned API contract, cross-domain reads, the client ' +
      'contract, and the documentation and structured data every domain publishes.',
  },
  {
    name: 'underpost:integration:security',
    directory: 'test/underpost/integration/security',
    groupOrder: 4,
    sources: [
      'src/cli/secrets.js',
      'src/server/ops/systemd.js',
      'src/server/security/container-storage.js',
      'src/server/security/selinux.js',
      'src/server/security/socketsecurity.js',
    ],
    description: 'SELinux policy, systemd units, the SOPS secret store and the Socket supply-chain audit.',
  },
  {
    name: 'underpost:integration:network',
    directory: 'test/underpost/integration/network',
    groupOrder: 5,
    sources: ['src/cli/wireguard.js', 'src/server/network/dns.js', 'src/server/network/forward-proxy.js'],
    description: 'WireGuard edge connectivity the cluster is reachable over.',
  },
  {
    name: 'underpost:integration:cluster',
    directory: 'test/underpost/integration/cluster',
    groupOrder: 6,
    sources: ['src/cli/docker-compose.js', 'src/db/mongo/MongoExpress.js', 'src/server/runtime/conf.js'],
    description: 'Instance clustering, node assignment and compute scheduling.',
  },
  {
    name: 'underpost:integration:ingress',
    directory: 'test/underpost/integration/ingress',
    groupOrder: 7,
    sources: [
      'src/server/network/middlewares.js',
      'src/server/network/router.js',
      'src/server/network/underpost-compression.js',
      'src/server/network/underpost-gateway.js',
      'src/server/network/underpost-ingress.js',
      'src/server/runtime/conf.js',
    ],
    description: 'Gateways, ingress controllers, deploy routes and traffic plans.',
  },
  {
    name: 'underpost:integration:observability',
    directory: 'test/underpost/integration/observability',
    groupOrder: 8,
    sources: [
      'src/cli/event.js',
      'src/mailer/*.js',
      'src/server/ops/cron.js',
      'src/server/ops/event-notification.js',
      'src/server/ops/monitoring.js',
      'src/server/runtime/runtime-status.js',
    ],
    description: 'Monitoring stack, deploy monitor, notifications and remediation.',
  },
  {
    name: 'underpost:integration',
    directory: 'test/underpost/integration',
    groupOrder: 9,
    // Non-recursive: the ordered areas underneath are projects of their own.
    recursive: false,
    sources: ['src/api/test/*.js'],
    description: 'Platform APIs served over a real server and a real database, and the test runner on real processes.',
  },
  {
    name: 'ecosystem:integration',
    directory: 'test/ecosystem/integration',
    groupOrder: 9,
    sources: ['src/client-builder/client-build-docs.js', 'src/server/build/docs.js'],
    description: 'Composition across domains: what one domain publishes and another serves.',
  },
  {
    name: 'cyberia:integration',
    directory: 'test/cyberia/integration',
    groupOrder: 9,
    sources: [
      'src/api/object-layer/object-layer.publication.js',
      'src/db/DataBaseProvider.js',
      'src/db/served-databases.js',
      'src/projects/cyberia/content-artifact.js',
      'src/projects/cyberia/content-release.js',
      'test/support/mongod.js',
    ],
    // Every content-release test does real database round trips: a release build copies ten collections.
    vitest: { hookTimeout: 60000, testTimeout: 30000 },
    description:
      'Cyberia against real boundaries: content releases on a MongoDB replica set — build, validate, ' +
      'promote, roll back, prune, restart, concurrent promotion, runtime isolation and one data source ' +
      'for every role — the content ' +
      'artifact materialization and saga import, the product CLI, the audio seed and the map preview ' +
      'refresh. The database suites need a mongod binary (UNDERPOST_MONGOD_BIN or PATH), the content suites ' +
      'a built cyberia-content artifact (CYBERIA_CONTENT_ROOT or ./cyberia-content); each skips without its ' +
      'requirement.',
  },
  {
    name: 'item-ledger:integration',
    directory: 'test/item-ledger/integration',
    groupOrder: 9,
    sources: ['src/api/item-ledger/item-ledger.indexer.js'],
    description:
      'ItemLedger against a live EVM: deploy, register, mint, transfer, burn, replay and reconcile. ' +
      'Needs CHAIN_RPC_URL and CHAIN_PRIVATE_KEY of a Besu validator or a Hardhat node; skipped without them.',
  },
  {
    name: 'underpost:e2e',
    directory: 'test/underpost/e2e',
    groupOrder: 10,
    sources: ['src/server/network/middlewares.js'],
    description:
      'Public routes driven in a real browser against a real database: direct navigation, refresh, ' +
      'in-app navigation, history, share links and the sanitizer. Needs puppeteer-core, a Firefox ' +
      'binary, a mongod binary and a built client; skipped without them.',
  },
  {
    name: 'cyberia:e2e',
    directory: 'test/cyberia/e2e',
    groupOrder: 10,
    sources: ['src/api/cyberia-server-defaults/*.js'],
    description:
      'Controlled WebSocket load against a running cyberia-server, so a real client session is ' +
      'measured end to end. Needs a reachable server; skipped without one.',
  },
  {
    name: 'item-ledger:contract',
    directory: 'hardhat',
    groupOrder: 11,
    description: 'ObjectLayerToken ERC-1155 behaviour on the in-process EVM.',
    // Hardhat owns Solidity compilation and the EVM these run against, so they
    // cannot be collected by Vitest. Hardhat's own `test` task pins a reporter
    // with no machine-readable output, so the suites — plain `node:test` files —
    // are run on Node's runner directly, which can emit the JUnit results the
    // dashboard ingests while still printing a readable run.
    delegate: ({ resultsPath = '', grep = '' } = {}) =>
      [
        '[ -x node_modules/.bin/hardhat ] || npm ci --no-audit --no-fund',
        './node_modules/.bin/hardhat build',
        [
          // Set by Hardhat's own test task; plugins branch on them.
          'HH_TEST=true NODE_ENV=test node --test',
          '--test-reporter=spec --test-reporter-destination=stdout',
          ...(resultsPath ? [`--test-reporter=junit --test-reporter-destination=${resultsPath}`] : []),
          ...(grep ? [`--test-name-pattern=${JSON.stringify(grep)}`] : []),
          "'test/**/*.js'",
        ].join(' '),
      ].join(' && '),
  },
];

/**
 * @constant TEST_FOOTPRINTS
 * @description How much of the machine one run can use.
 *
 * `batch` is the scheduler unit. `project` runs each selected project in its own fresh
 * process. `selection` runs the whole selection in one process. Batches run one at a
 * time. `vitest` limits each process. A footprint can stop file parallelism, but it
 * never starts it for a project that sets `parallel` off.
 * @memberof UnderpostTesting
 */
const TEST_FOOTPRINTS = Object.freeze({
  safe: {
    description: 'One project per fresh process, one worker, one file and one test at a time. The default.',
    batch: 'project',
    vitest: { pool: 'forks', maxWorkers: 1, fileParallelism: false, maxConcurrency: 1 },
  },
  balanced: {
    description: 'One project per fresh process, two workers, parallel files where the project permits.',
    batch: 'project',
    vitest: { pool: 'forks', maxWorkers: 2, maxConcurrency: 2 },
  },
  ci: {
    description:
      'The whole selection in one process, on the Vitest default workers. For a runner that owns its machine.',
    batch: 'selection',
    vitest: {},
  },
});

/**
 * @method testFootprintFactory
 * @description Resolves a footprint by name. An empty name gives `safe`.
 * @param {string} [name] - Footprint name.
 * @returns {{name: string, description: string, batch: string, vitest: object}} The footprint.
 * @throws {Error} When the name is not a declared footprint.
 * @memberof UnderpostTesting
 */
const testFootprintFactory = (name = '') => {
  const key = name || 'safe';
  if (!Object.hasOwn(TEST_FOOTPRINTS, key))
    throw new Error(`[test] unknown footprint '${key}' — expected one of ${Object.keys(TEST_FOOTPRINTS).join(', ')}`);
  return { name: key, ...TEST_FOOTPRINTS[key] };
};

/**
 * @method testDomainNames
 * @description Domain selectors `--suite` accepts, derived from the project names
 * so a new project is selectable the moment it is declared.
 * @returns {string[]} Domain names, plus the `all` selector.
 * @memberof UnderpostTesting
 */
const testDomainNames = () => [...new Set(TEST_PROJECTS.map(({ name }) => name.split(':')[0])), 'all'];

/**
 * @method resolveTestProjects
 * @description Expands a comma separated selector into projects.
 *
 * A selector matches a project name exactly, or matches it on a `:` boundary —
 * so `cyberia` takes every Cyberia project and `underpost:integration` takes
 * every ordered area under it. Expansion happens here rather than being passed
 * through as a glob so an unknown selector fails with the list of valid ones
 * instead of silently matching nothing and reporting a green run.
 * @param {string} [selector] - Domain names, project names, or empty for every project.
 * @returns {object[]} Selected projects, in declaration order.
 * @throws {Error} When a selector matches no declared project.
 * @memberof UnderpostTesting
 */
const resolveTestProjects = (selector = '') => {
  const selectors = selector
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (selectors.length === 0 || selectors.includes('all')) return TEST_PROJECTS;

  const selected = new Set();
  for (const value of selectors) {
    const matched = TEST_PROJECTS.filter(({ name }) => name === value || name.startsWith(`${value}:`));
    if (matched.length === 0)
      throw new Error(
        `[test] unknown selector '${value}' — expected one of ${testDomainNames().join(', ')} ` +
          `or a project: ${TEST_PROJECTS.map(({ name }) => name).join(', ')}`,
      );
    for (const project of matched) selected.add(project);
  }
  return TEST_PROJECTS.filter((project) => selected.has(project));
};

/**
 * @method productContextOf
 * @description The product context a project runs in: a product owns the projects whose
 * directory its catalog strips from the base template.
 * @param {{directory: string}} project - A declared project.
 * @param {Array<{stripPaths: string[]}>} [contexts] - Product contexts, as `loadProductContexts` resolves them.
 * @returns {object|null} The owning context, or `null` for a platform project.
 * @memberof UnderpostTesting
 */
const productContextOf = ({ directory }, contexts = []) =>
  contexts.find(({ stripPaths }) => stripPaths.some((path) => `./${directory}/`.startsWith(`${path}/`))) ?? null;

/**
 * @method runnableTestProjects
 * @description The projects this checkout runs: a project a product owns runs only where that
 * product's context is active.
 * @param {Array<{stripPaths: string[], active: boolean}>} [contexts] - Product contexts.
 * @returns {object[]} Runnable projects, in declaration order.
 * @memberof UnderpostTesting
 */
const runnableTestProjects = (contexts = []) =>
  TEST_PROJECTS.filter((project) => productContextOf(project, contexts)?.active !== false);

/**
 * @method resolveTestSelection
 * @description Splits a selector into the two runners that serve it, and the projects this
 * checkout leaves to their product's context.
 * @param {string} [selector] - Domain names, project names, or empty for every project.
 * @param {Array<{stripPaths: string[], active: boolean}>} [contexts] - Product contexts.
 * @returns {{projects: string[], runVitest: boolean, delegated: object[], excluded: Array<{name: string, context: object}>}} Selection.
 * @throws {Error} When a selector matches no declared project.
 * @memberof UnderpostTesting
 */
const resolveTestSelection = (selector = '', contexts = []) => {
  const runnable = runnableTestProjects(contexts);
  const selected = resolveTestProjects(selector);
  const projects = selected.filter((project) => runnable.includes(project));
  const vitestProjects = projects.filter(({ delegate }) => !delegate);
  const everyVitestProject = vitestProjects.length === runnable.filter(({ delegate }) => !delegate).length;
  return {
    // No `--project` flags when every project is selected: Vitest runs them all
    // by default, and an explicit list would fail a template that strips one.
    projects: everyVitestProject ? [] : vitestProjects.map(({ name }) => name),
    runVitest: vitestProjects.length > 0,
    delegated: projects.filter(({ delegate }) => delegate),
    excluded: selected
      .filter((project) => !runnable.includes(project))
      .map((project) => ({ name: project.name, context: productContextOf(project, contexts) })),
  };
};

/**
 * @method testProjectsFactory
 * @description Renders the Vitest `projects` array from the project table.
 *
 * A Vitest project is a standalone configuration and inherits nothing from the
 * root `test` block, so whatever every project needs is spread in here rather
 * than declared once at the root and silently dropped.
 * @param {object} [defaults] - Per-project `test` options shared by every project.
 * @param {Array<{stripPaths: string[], active: boolean}>} [contexts] - Product contexts.
 * @param {{vitest: object}} [footprint] - Limits every project applies, from `testFootprintFactory`.
 * @returns {object[]} Vitest inline project configurations.
 * @memberof UnderpostTesting
 */
const testProjectsFactory = (defaults = {}, contexts = [], footprint = { vitest: {} }) =>
  runnableTestProjects(contexts)
    .filter(({ delegate }) => !delegate)
    .map(({ name, directory, groupOrder, recursive = true, parallel = false, vitest = {} }) => ({
      test: {
        ...defaults,
        ...vitest,
        ...footprint.vitest,
        name,
        fileParallelism: parallel && footprint.vitest.fileParallelism !== false,
        include: [`${directory}/${recursive ? '**/' : ''}*.test.js`],
        sequence: { ...defaults.sequence, groupOrder },
      },
    }));

/**
 * @method vitestArgsFactory
 * @description Builds the Vitest argument vector for one run.
 * @param {object} [params]
 * @param {string[]} [params.projects] - Vitest project ids, empty for every project.
 * @param {string} [params.grep] - Substring filter on test names.
 * @param {boolean} [params.watch] - Keep the runner open and re-run on change.
 * @param {boolean} [params.coverage] - Emit the coverage reporters.
 * @param {{coverageDirectory: string, coverageInclude: string[]}} [params.batch] - Makes the run one
 *   batch: it measures the selection's sources and leaves the reports to the merge.
 * @param {string} [params.mergeReports] - Blob directory to merge instead of running tests.
 * @param {boolean} [params.logHeapUsage] - Print the heap size after each test.
 * @returns {string[]} Arguments for the `vitest` binary.
 * @memberof UnderpostTesting
 */
const vitestArgsFactory = ({
  projects = [],
  grep = '',
  watch = false,
  coverage = true,
  batch = null,
  mergeReports = '',
  logHeapUsage = false,
} = {}) => [
  // Subcommands, not flags: `vitest run --watch` is contradictory and Vitest
  // resolves it to a single non-watching run.
  watch ? 'watch' : 'run',
  ...(mergeReports ? [`--merge-reports=${mergeReports}`] : []),
  ...projects.flatMap((project) => ['--project', project]),
  ...(grep && !mergeReports ? ['--testNamePattern', grep] : []),
  ...(coverage ? ['--coverage'] : ['--coverage.enabled=false']),
  ...(batch
    ? [
        // A project with no files in this tree is a slice, not a failure. The merge still fails an empty run.
        '--passWithNoTests',
        ...(coverage
          ? [
              '--coverage.reporter=none',
              `--coverage.reportsDirectory=${batch.coverageDirectory}`,
              // The selection's scope, so a source another project loads counts as in a single run.
              ...batch.coverageInclude.map((glob) => `--coverage.include=${glob}`),
            ]
          : []),
      ]
    : []),
  ...(logHeapUsage ? ['--logHeapUsage'] : []),
];

/**
 * @constant COVERAGE_GATE_ENV_KEYS
 * @description The environment keys `coverageThresholdFactory` reads.
 * @memberof UnderpostTesting
 */
const COVERAGE_GATE_ENV_KEYS = ['COVERAGE_ENFORCE', 'COVERAGE_MIN'];

/**
 * @method vitestEnvFactory
 * @description The environment of one Vitest process.
 *
 * A batch writes a blob and never carries the coverage gate: its coverage is partial.
 * The merge and a watch run carry the gate. The runner keys come only from the arguments.
 * @param {object} [params]
 * @param {object} [params.env] - Environment to start from.
 * @param {string} [params.footprint] - Footprint name.
 * @param {string} [params.report] - Blob path. Set only for a batch.
 * @param {string} [params.allureResultsDirectory] - Allure results directory, or empty for none.
 * @param {boolean} [params.diagnose] - Log the coverage timings.
 * @returns {object} Environment for the child process.
 * @memberof UnderpostTesting
 */
const vitestEnvFactory = ({
  env = {},
  footprint = '',
  report = '',
  allureResultsDirectory = '',
  diagnose = false,
} = {}) => {
  const { footprintEnvKey, batchReportEnvKey, allureResultsEnvKey } = UNDERPOST_TESTING;
  const dropped = new Set([
    footprintEnvKey,
    batchReportEnvKey,
    allureResultsEnvKey,
    ...(report ? COVERAGE_GATE_ENV_KEYS : []),
  ]);
  const owned = {
    NODE_ENV: 'test',
    [footprintEnvKey]: footprint,
    [batchReportEnvKey]: report,
    [allureResultsEnvKey]: allureResultsDirectory,
    DEBUG: diagnose ? [env.DEBUG, 'vitest:coverage'].filter(Boolean).join(',') : env.DEBUG,
  };
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => !dropped.has(key))),
    ...Object.fromEntries(Object.entries(owned).filter(([, value]) => value)),
  };
};

/**
 * @method testExecutionPlanFactory
 * @description Orders a selection into batches. Each batch runs in one fresh process.
 * The batches run one at a time, in ascending `groupOrder`, so a lower group
 * completes before a higher group starts.
 * @param {object} [params]
 * @param {string} [params.selector] - Domain names, project names, or empty for every project.
 * @param {Array<{stripPaths: string[], active: boolean}>} [params.contexts] - Product contexts.
 * @param {string} [params.footprint] - Footprint name.
 * @returns {{footprint: string, projects: string[], coverageInclude: string[], batches: object[], excluded: object[]}}
 *   The plan. `projects` are the merge's `--project` flags, empty for every project.
 * @throws {Error} When the selector or the footprint is unknown.
 * @memberof UnderpostTesting
 */
const testExecutionPlanFactory = ({ selector = '', contexts = [], footprint = '' } = {}) => {
  const { name, batch } = testFootprintFactory(footprint);
  const { projects, runVitest, delegated, excluded } = resolveTestSelection(selector, contexts);
  const vitestProjects = !runVitest
    ? []
    : projects.length > 0
      ? projects.map((project) => TEST_PROJECTS.find(({ name: declared }) => declared === project))
      : runnableTestProjects(contexts).filter(({ delegate }) => !delegate);
  const units =
    batch === 'project' ? vitestProjects.map((project) => [project]) : vitestProjects.length ? [vitestProjects] : [];
  const batches = [...units, ...delegated.map((project) => [project])]
    .map((members) => ({
      groupOrder: Math.min(...members.map(({ groupOrder }) => groupOrder)),
      projects: members.map(({ name: member }) => member),
      delegated: Boolean(members[0].delegate),
    }))
    .sort((a, b) => a.groupOrder - b.groupOrder)
    .map(({ delegated: isDelegated, ...rest }, index) => ({
      index: index + 1,
      ...rest,
      ...(isDelegated
        ? { delegated: true }
        : { report: `${UNDERPOST_TESTING.runs.reportDirectory}/batch-${String(index + 1).padStart(3, '0')}.blob` }),
    }));
  return {
    footprint: name,
    projects,
    coverageInclude: runVitest
      ? coverageIncludeFactory(
          projects.flatMap((project) => ['--project', project]),
          contexts,
        )
      : [],
    batches,
    excluded: excluded.map(({ name: project, context }) => ({
      name: project,
      deployId: context.deployId,
      missing: context.missing,
    })),
  };
};

/**
 * @method testBatchStatus
 * @description Names how one batch process ended.
 *
 * `failed`: tests failed and the batch wrote its report. `error`: the runner failed
 * before it wrote a report, or the process did not start. `killed`: SIGKILL, often
 * the kernel out-of-memory killer. `signaled`: another signal from outside.
 * `timeout`: the batch ran past its limit. `interrupted`: the operator stopped the run.
 * @param {object} [outcome]
 * @param {number|null} [outcome.exitCode] - Exit code, or null when a signal ended the process.
 * @param {string|null} [outcome.signal] - Signal that ended the process.
 * @param {boolean} [outcome.timedOut] - The runner stopped the batch at its time limit.
 * @param {boolean} [outcome.interrupted] - The operator stopped the run during the batch.
 * @param {boolean} [outcome.reported] - The batch wrote its report.
 * @returns {string} Status.
 * @memberof UnderpostTesting
 */
const testBatchStatus = ({
  exitCode = null,
  signal = null,
  timedOut = false,
  interrupted = false,
  reported = false,
} = {}) => {
  if (interrupted) return 'interrupted';
  if (timedOut) return 'timeout';
  if (signal === 'SIGKILL') return 'killed';
  if (signal) return 'signaled';
  if (exitCode === 0) return 'passed';
  // No exit code and no signal: the process never started.
  return reported && exitCode !== null ? 'failed' : 'error';
};

/**
 * @method testRunStatus
 * @description The status of a whole run. A run passes only when every batch passed
 * or was skipped and the merge passed.
 * @param {{batches: Array<{status: string}>, merge?: {status: string}}} manifest - Run manifest.
 * @returns {'passed'|'failed'|'interrupted'} Status.
 * @memberof UnderpostTesting
 */
const testRunStatus = ({ batches = [], merge } = {}) => {
  if (batches.some(({ status }) => status === 'interrupted')) return 'interrupted';
  const batchesPassed = batches.every(({ status }) => status === 'passed' || status === 'skipped');
  return batchesPassed && (!merge || merge.status === 'passed') ? 'passed' : 'failed';
};

/**
 * @method testRunReportFactory
 * @description Renders a run manifest as a text table: one row per batch, then the merge.
 * @param {{batches: object[], merge?: object}} manifest - Run manifest.
 * @returns {string} Table.
 * @memberof UnderpostTesting
 */
const testRunReportFactory = ({ batches = [], merge } = {}) => {
  const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : '-');
  const megabytes = (bytes) => (Number.isFinite(bytes) ? `${Math.round(bytes / 1024 / 1024)}MB` : '-');
  const diagnosed = batches.some(({ diagnostics }) => diagnostics);
  const row = ({ exitCode, signal, durationMs, diagnostics }) => [
    `${exitCode ?? '-'}`,
    signal ?? '-',
    seconds(durationMs),
    ...(diagnosed ? [megabytes(diagnostics?.peakRssBytes), seconds(diagnostics?.cpuMs)] : []),
  ];
  const rows = [
    ['batch', 'projects', 'status', 'exit', 'signal', 'duration', ...(diagnosed ? ['peak rss', 'cpu'] : [])],
    ...batches.map((batch) => [`${batch.index}`, batch.projects.join(','), batch.status, ...row(batch)]),
    ...(merge ? [['merge', '', merge.status, ...row(merge)]] : []),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((cells) => cells[column].length)));
  return rows
    .map((cells) =>
      cells
        .map((cell, column) => cell.padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
};

/** A run id: the UTC start time to the millisecond, then the runner's process id. */
const TEST_RUN_ID = /^\d{8}T\d{6}\.\d{3}Z-\d+$/;

/**
 * @method testRunIdFactory
 * @description A run id that sorts by start time.
 * @param {Date} date - Start time.
 * @param {number} pid - Runner process id.
 * @returns {string} Run id.
 * @memberof UnderpostTesting
 */
const testRunIdFactory = (date, pid) => `${date.toISOString().replace(/[-:]/g, '')}-${pid}`;

/**
 * @method staleTestRuns
 * @description The runs to delete before a new run starts, so `kept` runs remain.
 * Only names in the run id format are candidates.
 * @param {string[]} [entries] - Names in the runs directory.
 * @param {number} [kept] - Runs to keep, the new run included.
 * @returns {string[]} Run ids to delete, oldest first.
 * @memberof UnderpostTesting
 */
const staleTestRuns = (entries = [], kept = UNDERPOST_TESTING.runs.kept) => {
  const runs = entries.filter((entry) => TEST_RUN_ID.test(entry)).sort();
  return runs.slice(0, Math.max(0, runs.length - Math.max(0, kept - 1)));
};

/**
 * @method coverageThresholdFactory
 * @description Resolves the minimum total line coverage a run must reach, or `null`
 * when the run reports without gating.
 *
 * Gating is opt-in because a tier selection measures a slice of the tree: holding
 * every partial local run to the whole-suite number would fail runs that never
 * loaded the code being counted. `npm run test:coverage` and CI opt in; `COVERAGE_MIN`
 * lowers the bar for a repository whose suite is still catching up to it.
 * @param {object} [env] - Environment to read `COVERAGE_ENFORCE` and `COVERAGE_MIN` from.
 * @returns {number|null} Threshold percentage, or `null` to report without gating.
 * @throws {Error} When `COVERAGE_MIN` is not a percentage.
 * @memberof UnderpostTesting
 */
const coverageThresholdFactory = ({ COVERAGE_ENFORCE, COVERAGE_MIN } = {}) => {
  if (COVERAGE_MIN !== undefined && COVERAGE_MIN !== '') {
    const threshold = Number(COVERAGE_MIN);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)
      throw new Error(`[test] COVERAGE_MIN must be a percentage between 0 and 100, got '${COVERAGE_MIN}'`);
    return threshold;
  }
  return COVERAGE_ENFORCE === '1' || COVERAGE_ENFORCE === 'true' ? UNDERPOST_TESTING.coverageThreshold : null;
};

/**
 * @method coverageIncludeFactory
 * @description Source globs a run measures coverage over, from the tier selection
 * on its own command line.
 *
 * Read from the argument vector rather than passed in, because the runner's config
 * is loaded by the Vitest process the arguments were handed to — a `--project` the
 * caller added by hand is as authoritative as one `vitestArgsFactory` rendered.
 * @param {string[]} [argv] - Argument vector carrying the `--project` selection.
 * @param {Array<{stripPaths: string[], active: boolean}>} [contexts] - Product contexts.
 * @returns {string[]} Globs for `coverage.include`, every selected runnable tier's sources.
 * @throws {Error} When a selected project matches no declared tier.
 * @memberof UnderpostTesting
 */
const coverageIncludeFactory = (argv = [], contexts = []) => {
  const runnable = runnableTestProjects(contexts);
  return [
    ...new Set(
      resolveTestProjects(vitestProjectSelector(argv))
        .filter((project) => runnable.includes(project))
        .flatMap(({ sources = [] }) => sources),
    ),
  ];
};

/**
 * @method vitestProjectSelector
 * @description The tier selector a Vitest argument vector carries, as `--project` flags.
 * @param {string[]} [argv] - Argument vector.
 * @returns {string} Comma separated selector, empty when no project was named.
 * @memberof UnderpostTesting
 */
const vitestProjectSelector = (argv = []) =>
  argv
    .flatMap((arg, index) =>
      arg === '--project' ? [argv[index + 1]] : arg.startsWith('--project=') ? [arg.slice('--project='.length)] : [],
    )
    .filter(Boolean)
    .join(',');

/**
 * @method coverageReportKey
 * @description The directory under `coverage/` a selection's HTML report is written to,
 * derived from the domains the selection spans so a deploy that names `underpost,ecosystem`
 * and a run that was handed the same projects as `--project` flags address one report — and
 * so two selections never overwrite each other's on a host that serves both. A selection
 * that spans every domain is `all`, rather than a list of every name.
 * @param {string} [selector] - Domain names, project names, or empty for every project.
 * @returns {string} Domain names in declaration order joined with `-`, or `all`.
 * @throws {Error} When a selector matches no declared project.
 * @memberof UnderpostTesting
 */
const coverageReportKey = (selector = '') => {
  const domains = [
    ...new Set(
      resolveTestProjects(selector)
        .filter(({ delegate }) => !delegate)
        .map(({ name }) => name.split(':')[0]),
    ),
  ];
  return domains.length === ALL_DOMAINS.length ? 'all' : domains.join('-');
};

/**
 * @method allureManifestsFactory
 * @description Renders the Allure dashboard: a claim for the results the runs
 * write, the report server, and the ways in.
 *
 * The server watches the results directory rather than being pushed a report,
 * so a Job that writes its results and exits needs no callback and no ordering
 * against the dashboard's own lifecycle.
 * @param {object} params
 * @param {string} params.namespace - Target namespace.
 * @param {string} [params.host] - Hostname to route `/allure` on; omitted means NodePort only.
 * @returns {string} Concatenated YAML documents.
 * @memberof UnderpostTesting
 */
const allureManifestsFactory = ({ namespace, host = '' }) => {
  const { allure } = UNDERPOST_TESTING;
  const manifests = [
    `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${allure.pvcName}
  namespace: ${namespace}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: ${allure.pvcStorage}`,
    `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${allure.name}
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${allure.name}
  template:
    metadata:
      labels:
        app: ${allure.name}
    spec:
      containers:
        - name: ${allure.name}
          image: ${allure.image}
          ports:
            - containerPort: ${allure.port}
          env:
            - name: CHECK_RESULTS_EVERY_SECONDS
              value: '${allure.checkResultsEverySeconds}'
            - name: KEEP_HISTORY
              value: '${allure.keepHistory ? 1 : 0}'
            - name: URL_PREFIX
              value: '${host ? allure.subPath : ''}'
          volumeMounts:
            - name: results
              mountPath: ${allure.resultsPath}
            - name: reports
              mountPath: ${allure.reportsPath}
          readinessProbe:
            httpGet:
              path: ${host ? allure.subPath : ''}/allure-docker-service/version
              port: ${allure.port}
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: results
          persistentVolumeClaim:
            claimName: ${allure.pvcName}
        - name: reports
          emptyDir: {}`,
    `apiVersion: v1
kind: Service
metadata:
  name: ${allure.name}
  namespace: ${namespace}
spec:
  type: NodePort
  selector:
    app: ${allure.name}
  ports:
    - port: ${allure.port}
      targetPort: ${allure.port}
      nodePort: ${allure.nodePort}`,
  ];

  if (host)
    manifests.push(`apiVersion: projectcontour.io/v1
kind: HTTPProxy
metadata:
  name: ${allure.routeName}
  namespace: ${namespace}
spec:
  virtualhost:
    fqdn: ${host}
    tls:
      secretName: ${host}
  routes:
    - conditions:
        - prefix: ${allure.subPath}
      services:
        - name: ${allure.name}
          port: ${allure.port}`);

  return manifests.join('\n---\n');
};

/**
 * @method testJobManifestFactory
 * @description Renders a Job that runs one suite inside the cluster.
 *
 * The Job mounts the same results claim the dashboard reads, so its output is
 * on the dashboard the moment it exits — no artifact upload step, and no
 * dependency on the Job's own pod outliving the run.
 * @param {object} params
 * @param {string} params.name - Job name.
 * @param {string} params.namespace - Target namespace.
 * @param {string} params.image - Image carrying the engine and its dependencies.
 * @param {string} params.suite - Suite or tier selector passed to `underpost test`.
 * @param {string} [params.nodeName] - Pins the pod to one node.
 * @returns {string} Job YAML.
 * @memberof UnderpostTesting
 */
const testJobManifestFactory = ({ name, namespace, image, suite, nodeName = '' }) => {
  const { allure, job } = UNDERPOST_TESTING;
  const command = ['underpost', 'test', ...(suite ? [suite] : []), '--itc', '--allure'].join(' ');
  return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${name}
  namespace: ${namespace}
spec:
  backoffLimit: ${job.backoffLimit}
  ttlSecondsAfterFinished: ${job.ttlSecondsAfterFinished}
  template:
    metadata:
      labels:
        app: ${job.namePrefix}
    spec:
      restartPolicy: ${job.restartPolicy}
${nodeName ? `      nodeName: ${nodeName}\n` : ''}      containers:
        - name: ${job.namePrefix}
          image: ${image}
          workingDir: ${job.workingDirectory}
          command: ['sh', '-lc', '${command}']
          env:
            - name: NODE_ENV
              value: test
            - name: ${UNDERPOST_TESTING.allureResultsEnvKey}
              value: ${allure.resultsPath}
          volumeMounts:
            - name: results
              mountPath: ${allure.resultsPath}
      volumes:
        - name: results
          persistentVolumeClaim:
            claimName: ${allure.pvcName}`;
};

/**
 * @constant TEST_IMPACT
 * @description Which domains a changed path can break, in match order.
 *
 * The first rule whose `match` the path starts with decides, so the specific
 * domain prefixes come before the platform ones. `domains` holds every domain a
 * change to that path can reach, never only the domain that owns the file: the
 * Object Layer protocol is consumed by three other domains, so a change to it
 * selects their suites too. A path no rule matches widens to every project —
 * an incomplete model must over-test, never under-test.
 * @memberof UnderpostTesting
 */
const TEST_IMPACT = [
  // What decides which tests run, or how they run, invalidates every selection.
  { match: ['vitest.config.js', 'package.json', 'package-lock.json'], domains: ALL_DOMAINS },
  {
    match: ['src/server/build/testing.js', 'src/cli/test.js', 'test/support/', '.github/workflows/'],
    domains: ALL_DOMAINS,
  },
  // A test only proves its own domain.
  ...Object.keys(TEST_DOMAINS).map((domain) => ({ match: [`test/${domain}/`], domains: [domain] })),
  // The canonical protocol: three domains read it, and the contract suites check it from outside.
  {
    match: [
      'src/api/object-layer/',
      'src/client/components/objectlayer-studio/',
      'src/server/domain/object-layer-resolver.js',
    ],
    domains: ['object-layer', 'item-ledger', 'cyberia', 'cryptokoyn', 'ecosystem'],
  },
  { match: ['src/api/item-ledger', 'hardhat/'], domains: ['item-ledger'] },
  // The render routes every Object Layer host serves; the Cyberia Studio extends them.
  { match: ['src/api/atlas-sprite-sheet/'], domains: ['object-layer', 'cyberia', 'ecosystem'] },
  {
    match: [
      'src/api/cyberia-',
      'src/client/components/cyberia/',
      'src/grpc/cyberia/',
      'src/projects/cyberia/',
      'src/runtime/cyberia-',
      'src/runtime/engine-cyberia/',
      'bin/cyberia.js',
    ],
    domains: ['cyberia'],
  },
  {
    match: [
      'src/api/wallet-account/',
      'src/client/components/cryptokoyn/',
      'src/client/components/wallet/',
      'src/server/security/siwe.js',
      'src/server/security/typed-data.js',
    ],
    domains: ['cryptokoyn'],
  },
  // Cross-domain plumbing: every domain reads another domain through it.
  {
    match: ['src/server/domain/'],
    domains: ['ecosystem', 'object-layer', 'item-ledger', 'cyberia', 'cryptokoyn'],
  },
  // Authored documentation and the structured data each client publishes.
  { match: ['src/client/public/docs/', 'src/server/build/docs.js'], domains: ['ecosystem', 'underpost'] },
  { match: ['src/client/components/', 'src/client/public/', 'src/client/ssr/'], domains: ['ecosystem', 'underpost'] },
  // Persistence every product domain stores through.
  { match: ['src/db/'], domains: ['underpost', 'object-layer', 'cyberia'] },
  // The release primitive: Cyberia content releases run on it.
  { match: ['src/server/release/'], domains: ['underpost', 'cyberia'] },
  // The engineering record at the tree root: the release tooling rewrites it and asserts it.
  { match: ['README.md', 'AGENTS.md', 'CLI-HELP.md', 'LICENSE'], domains: ['underpost'] },
  // The platform itself.
  {
    match: [
      'underpost.config.js',
      'src/api/',
      'src/cli/',
      'src/client-builder/',
      'src/index.js',
      'src/mailer/',
      'src/server/',
      'bin/',
      'deploy/',
      'manifests/',
      'scripts/',
    ],
    domains: ['underpost'],
  },
];

/**
 * @method impactedDomains
 * @description The domains a set of changed paths can break.
 *
 * A path outside every rule widens to every domain rather than selecting none:
 * an unmapped path is an incomplete model, and a silent green run is the one
 * answer that must never come out of it.
 * @param {string[]} [paths] - Repository-relative paths, as a diff lists them.
 * @returns {string[]} Domain ids, in declaration order.
 * @memberof UnderpostTesting
 */
const impactedDomains = (paths = []) => {
  const impacted = new Set();
  for (const path of paths.map((value) => `${value}`.trim().replace(/^\.\//, '')).filter(Boolean)) {
    const rule = TEST_IMPACT.find(({ match }) => match.some((prefix) => path.startsWith(prefix)));
    for (const domain of rule ? rule.domains : ALL_DOMAINS) impacted.add(domain);
  }
  return Object.keys(TEST_DOMAINS).filter((domain) => impacted.has(domain));
};

/**
 * @method impactSelector
 * @description The selector that runs everything a set of changed paths can break.
 * @param {string[]} [paths] - Repository-relative paths, as a diff lists them.
 * @returns {string} Comma separated domains, `all` when every domain is impacted,
 *   and empty when nothing changed.
 * @memberof UnderpostTesting
 */
const impactSelector = (paths = []) => {
  const domains = impactedDomains(paths);
  if (domains.length === 0) return '';
  return domains.length === ALL_DOMAINS.length ? 'all' : domains.join(',');
};

export {
  UNDERPOST_TESTING,
  TEST_DOMAINS,
  TEST_FOOTPRINTS,
  TEST_IMPACT,
  TEST_LEVELS,
  TEST_PROJECTS,
  allureManifestsFactory,
  coverageIncludeFactory,
  coverageReportKey,
  coverageThresholdFactory,
  impactSelector,
  impactedDomains,
  productContextOf,
  resolveTestProjects,
  resolveTestSelection,
  runnableTestProjects,
  staleTestRuns,
  testBatchStatus,
  testDomainNames,
  testExecutionPlanFactory,
  testFootprintFactory,
  testJobManifestFactory,
  testProjectsFactory,
  testRunIdFactory,
  testRunReportFactory,
  testRunStatus,
  vitestArgsFactory,
  vitestEnvFactory,
  vitestProjectSelector,
};
