/**
 * The test tier contract: which suites exist, the order they run in, and the
 * in-cluster surfaces that execute and report them.
 *
 * Tiers are a lifecycle, not a taxonomy. A gateway assertion that fails because
 * SELinux denied a bind is a security failure reported at the ingress layer, so
 * the lower tier has to have run — and passed — before the higher one is worth
 * reading. Vitest expresses that with one project per tier and an ascending
 * `sequence.groupOrder`; nothing outside this table decides what runs when.
 *
 * This module is pure: it renders the runner configuration, the argument vector
 * and the manifests from values it is given. Resolving deploy configuration,
 * spawning the runner and talking to the cluster belong to `src/cli/test.js`.
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
 * @constant TEST_TIERS
 * @description Every runnable tier, in lifecycle order.
 *
 * `name` doubles as the Vitest project id, and its prefix before `:` is the
 * suite it belongs to — so `--suite infra` needs no second table to expand.
 *
 * `groupOrder` is what Vitest sequences on: equal values run in parallel, lower
 * values run to completion first. It starts at 1, never 0 — Vitest routes a
 * project left on the default 0 with a single worker into a bucket it appends
 * after every ordered group, which would run the first tier last.
 *
 * A tier with a `delegate` runs on its own runner instead of as a Vitest
 * project, after the Vitest run — so a delegated tier belongs in the last
 * group, where the order it is declared in still matches the order it runs in.
 *
 * `sources` are the modules the tier's suites drive directly, and they are what
 * coverage is measured over when the tier is selected. A module reached only as
 * a collaborator — everything the `src/index.js` barrel pulls in behind one CLI
 * call, everything a suite spawns into its own process — belongs to whichever
 * tier asserts against it, or to none: counting it here reports a floor no test
 * in the selection can move. A delegated tier declares none, because its runner
 * reports its own coverage.
 * @memberof UnderpostTesting
 */
const TEST_TIERS = [
  {
    name: 'unit',
    directory: 'test/unit',
    groupOrder: 1,
    sources: [
      'conf.js',
      'src/cli/release.js',
      'src/client-builder/client-build-docs.js',
      'src/projects/underpost/*.js',
      'src/server/runtime/conf.js',
      'src/server/security/crypto.js',
    ],
    description: 'Pure functions with no host, cluster or network dependency.',
  },
  {
    name: 'infra:1-security',
    directory: 'test/integration/infra/1-security',
    groupOrder: 2,
    sources: ['src/cli/secrets.js', 'src/server/ops/systemd.js', 'src/server/security/selinux.js'],
    description: 'SELinux policy, systemd units and the SOPS secret store.',
  },
  {
    name: 'infra:2-network',
    directory: 'test/integration/infra/2-network',
    groupOrder: 3,
    sources: ['src/cli/wireguard.js', 'src/server/network/dns.js', 'src/server/network/forward-proxy.js'],
    description: 'WireGuard edge connectivity the cluster is reachable over.',
  },
  {
    name: 'infra:3-cluster',
    directory: 'test/integration/infra/3-cluster',
    groupOrder: 4,
    sources: ['src/cli/docker-compose.js', 'src/server/runtime/conf.js'],
    description: 'Instance clustering, node assignment and compute scheduling.',
  },
  {
    name: 'infra:4-ingress',
    directory: 'test/integration/infra/4-ingress',
    groupOrder: 5,
    sources: [
      'src/server/network/router.js',
      'src/server/network/underpost-compression.js',
      'src/server/network/underpost-gateway.js',
      'src/server/network/underpost-ingress.js',
      'src/server/runtime/conf.js',
    ],
    description: 'Gateways, ingress controllers, deploy routes and traffic plans.',
  },
  {
    name: 'infra:5-observability',
    directory: 'test/integration/infra/5-observability',
    groupOrder: 6,
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
    name: 'app',
    directory: 'test/integration/app',
    groupOrder: 7,
    sources: ['src/api/test/*.js', 'src/server/ops/logger.js'],
    // Non-recursive: the cyberia extension underneath is its own tier, because
    // it ships in a separate product CLI and must stay separately runnable.
    recursive: false,
    description: 'Platform application layer served over the provisioned stack.',
  },
  {
    name: 'cyberia',
    directory: 'test/integration/app/cyberia',
    groupOrder: 7,
    sources: [
      'src/api/cyberia-server-defaults/*.js',
      'src/api/object-layer/object-layer.model.js',
      'src/projects/cyberia/shape-generator.js',
    ],
    description: 'Cyberia MMO extension: content, persistence and shape generation.',
  },
  {
    name: 'contracts',
    directory: 'hardhat',
    groupOrder: 7,
    description: 'ObjectLayerToken ERC-1155 behaviour on the in-process EVM.',
    // Hardhat owns Solidity compilation and the EVM these run against, so they
    // cannot be collected by Vitest. Hardhat's own `test` task pins a reporter
    // with no machine-readable output, so the suites — plain `node:test` files —
    // are run on Node's runner directly, which can emit the JUnit results the
    // dashboard ingests while still printing a readable run.
    delegate: ({ resultsPath = '', grep = '' } = {}) =>
      [
        // A nested project with its own lockfile: resolve it where it is missing
        // (a fresh clone, a Job pod) and skip the cost where it is not.
        '[ -d node_modules ] || npm ci --no-audit --no-fund',
        'npx hardhat build',
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
 * @method testSuiteNames
 * @description Suite selectors `--suite` accepts, derived from the tier names
 * so a new tier is selectable the moment it is declared.
 * @returns {string[]} Suite names, plus the `all` selector.
 * @memberof UnderpostTesting
 */
const testSuiteNames = () => [...new Set(TEST_TIERS.map(({ name }) => name.split(':')[0])), 'all'];

/**
 * @method resolveTestTiers
 * @description Expands a comma separated selector into tiers.
 *
 * Expansion happens here rather than being passed through as a glob so an
 * unknown selector fails with the list of valid ones instead of silently
 * matching nothing and reporting a green run.
 * @param {string} [selector] - Suite names, tier names, or empty for every tier.
 * @returns {object[]} Selected tiers, in declaration order.
 * @throws {Error} When a selector matches no declared tier.
 * @memberof UnderpostTesting
 */
const resolveTestTiers = (selector = '') => {
  const selectors = selector
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (selectors.length === 0 || selectors.includes('all')) return TEST_TIERS;

  const selected = new Set();
  for (const value of selectors) {
    const matched = TEST_TIERS.filter(({ name }) => name === value || name.startsWith(`${value}:`));
    if (matched.length === 0)
      throw new Error(
        `[test] unknown suite '${value}' — expected one of ${testSuiteNames().join(', ')} ` +
          `or a tier: ${TEST_TIERS.map(({ name }) => name).join(', ')}`,
      );
    for (const tier of matched) selected.add(tier);
  }
  return TEST_TIERS.filter((tier) => selected.has(tier));
};

/**
 * @method resolveTestSelection
 * @description Splits a selector into the two runners that serve it.
 * @param {string} [selector] - Suite names, tier names, or empty for every tier.
 * @returns {{projects: string[], runVitest: boolean, delegated: object[]}} Selection.
 * @throws {Error} When a selector matches no declared tier.
 * @memberof UnderpostTesting
 */
const resolveTestSelection = (selector = '') => {
  const tiers = resolveTestTiers(selector);
  const vitestTiers = tiers.filter(({ delegate }) => !delegate);
  const everyVitestTier = vitestTiers.length === TEST_TIERS.filter(({ delegate }) => !delegate).length;
  return {
    // No `--project` flags when every tier is selected: Vitest runs them all by
    // default, and an explicit list would fail a template that strips one.
    projects: everyVitestTier ? [] : vitestTiers.map(({ name }) => name),
    runVitest: vitestTiers.length > 0,
    delegated: tiers.filter(({ delegate }) => delegate),
  };
};

/**
 * @method testProjectsFactory
 * @description Renders the Vitest `projects` array from the tier table.
 *
 * A Vitest project is a standalone configuration and inherits nothing from the
 * root `test` block, so whatever every tier needs is spread in here rather than
 * declared once at the root and silently dropped.
 * @param {object} [defaults] - Per-project `test` options shared by every tier.
 * @returns {object[]} Vitest inline project configurations.
 * @memberof UnderpostTesting
 */
const testProjectsFactory = (defaults = {}) =>
  TEST_TIERS.filter(({ delegate }) => !delegate).map(({ name, directory, groupOrder, recursive = true }) => ({
    test: {
      ...defaults,
      name,
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
 * @returns {string[]} Arguments for the `vitest` binary.
 * @memberof UnderpostTesting
 */
const vitestArgsFactory = ({ projects = [], grep = '', watch = false, coverage = true } = {}) => [
  // Subcommands, not flags: `vitest run --watch` is contradictory and Vitest
  // resolves it to a single non-watching run.
  watch ? 'watch' : 'run',
  ...projects.flatMap((project) => ['--project', project]),
  ...(grep ? ['--testNamePattern', grep] : []),
  ...(coverage ? ['--coverage'] : ['--coverage.enabled=false']),
];

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
 * @returns {string[]} Globs for `coverage.include`, every selected tier's sources.
 * @throws {Error} When a selected project matches no declared tier.
 * @memberof UnderpostTesting
 */
const coverageIncludeFactory = (argv = []) => {
  const projects = argv.flatMap((arg, index) =>
    arg === '--project' ? [argv[index + 1]] : arg.startsWith('--project=') ? [arg.slice('--project='.length)] : [],
  );
  return [...new Set(resolveTestTiers(projects.filter(Boolean).join(',')).flatMap(({ sources = [] }) => sources))];
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

export {
  UNDERPOST_TESTING,
  TEST_TIERS,
  allureManifestsFactory,
  coverageIncludeFactory,
  coverageThresholdFactory,
  resolveTestSelection,
  resolveTestTiers,
  testJobManifestFactory,
  testProjectsFactory,
  testSuiteNames,
  vitestArgsFactory,
};
