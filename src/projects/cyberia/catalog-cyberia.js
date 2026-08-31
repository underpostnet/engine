/**
 * Cyberia CLI content catalog.
 *
 * A per-deploy product catalog: pure data, loaded dynamically by deploy id via
 * {@link module:src/server/build/catalog.js} so the base build and template assembly never
 * statically depend on it. Exports the uniform product-catalog shape:
 *
 *   - `sourceMoves`       — public `[src, dest]` pairs moved into the engine tree before a build.
 *   - `privateConfPaths`  — extra payloads synced into the deploy's private repo.
 *   - `templatePaths`     — engine paths packaged into the standalone product CLI template.
 *   - `stripPaths`        — paths removed from the base `pwa-microservices-template`.
 *   - `moves`             — `[src, dest]` pairs moved into the template during assembly (like sourceMoves but into the template target).
 *   - `copies`            — `[src, dest]` pairs copied into the template during assembly (like moves but copied instead of moved).
 *   - `keywords`          — npm keywords for the standalone product CLI package.
 *   - `description`       — npm description for the standalone product CLI package.
 *   - `packageName`       — npm name of the product package; the deploy id without `dd-` otherwise.
 *   - `packageBin`        — bin map of the standalone product CLI.
 *   - `packageDependencies` — runtime dependencies this product adds to the engine's.
 *   - `packageScripts`    — npm scripts this product adds to the engine's.
 *
 * The `package*` fields are the single declaration of what this product's manifests carry:
 * every generated manifest — the deploy's `engine-private/conf/<id>/package.json`, the product
 * repository's, and the published instance copy — is built from them by
 * {@link module:src/server/build/package.js}. Nothing else may name them.
 *
 * @module src/projects/cyberia/catalog-cyberia.js
 * @namespace CyberiaCatalog
 */

const DEPLOY_ID = 'dd-cyberia';
const DOCKER_COMPOSE_ID = 'cyberia';

const dockerScript = (action, flags = '') =>
  `node bin docker-compose --${action}${flags} --deploy-id ${DEPLOY_ID} --docker-compose-id ${DOCKER_COMPOSE_ID}`;

export default {
  packageName: 'cyberia',
  // Pod bootstraps link this product checkout over the image CLI before continuing.
  packageBin: { cyberia: 'bin/index.js', underpost: 'bin/index.js' },
  // Native-dependency pin list: versions stay reproducible across CI and production deploys.
  packageDependencies: {
    'adm-zip': '^0.6.0',
    'maxrects-packer': '^2.7.3',
    pngjs: '^7.0.0',
    jimp: '^1.6.0',
    sharp: '^0.35.3',
    ethers: '~6.16.0',
  },
  packageScripts: {
    'docker:generate': dockerScript('generate'),
    'docker:up': dockerScript('up'),
    'docker:up:build': dockerScript('up', ' --build'),
    'docker:down': dockerScript('down'),
    'docker:down:volumes': dockerScript('down', ' --volumes'),
    'docker:restart': dockerScript('restart'),
    'docker:pull': dockerScript('pull'),
    'docker:logs': dockerScript('logs'),
    'docker:status': dockerScript('status'),
    'docker:reset': dockerScript('reset'),
  },
  sourceMoves: [],
  privateConfPaths: [
    /** INSTANCE_CODES */

    'cyberia-instances/amethyst-strata-expansion',
    'cyberia-sagas/amethyst-strata-expansion.json',
    'cyberia-instances/FOREST',
    'cyberia-instances/TEST',

    /** INSTANCE_CODES */
  ],
  templatePaths: [
    '/src/grpc/cyberia',
    '/src/client/ssr/views/CyberiaServerMetrics.js',
    '/src/client/ssr/views/Cyberia404.js',
    '/test/integration/app/cyberia',
    '/src/projects/cyberia',
    '/src/runtime/cyberia-server',
    '/src/runtime/cyberia-client',
    '/src/runtime/engine-cyberia',
    '/.github/workflows/hardhat.ci.yml',
    '/src/client/public/cyberia-docs',
    '/src/api/cyberia-server-defaults',
    '/.github/workflows/docker-image.cyberia-client.ci.yml',
    '/.github/workflows/docker-image.cyberia-client.dev.ci.yml',
    '/.github/workflows/docker-image.cyberia-server.ci.yml',
    '/.github/workflows/docker-image.cyberia-server.dev.ci.yml',
    '/.github/workflows/cyberia-client.cd.yml',
    '/.github/workflows/cyberia-server.cd.yml',
    '/.github/workflows/coverall.cyberia.ci.yml',
    '/bin/cyberia.js',
    '/hardhat',
    // The deploy scripts `run-workflow build-manifest` mirrors into each generated instance
    // repository. The base template drops the whole `deploy/` tree, so the product CLI only has
    // them if it packages them here.
    '/deploy/cyberia-client',
    '/deploy/cyberia-server',
  ],
  stripPaths: [
    './src/projects/cyberia',
    './src/grpc/cyberia',
    './src/runtime/cyberia-server',
    './src/runtime/cyberia-client',
    './src/runtime/engine-cyberia',
    './test/integration/app/cyberia',
    './src/client/public/cyberia-docs',
    './bin/cyberia.js',
    './hardhat',
    './deploy/cyberia-client',
    './deploy/cyberia-server',
  ],
  moves: [],
  copies: [
    ['./src/runtime/engine-cyberia/docker-compose.yml', './docker-compose.yml'],
    ['./src/runtime/engine-cyberia/compose.env', './.env.example'],
    ['./src/runtime/engine-cyberia/.', './'],
  ],
  keywords: [
    'cyberia',
    'cyberia-cli',
    'engine-cyberia',
    'sidecar',
    'data-layer',
    'object-layer',
    'atlas-sprite-sheet',
    'ipfs',
    'erc-1155',
    'object-layer-token',
    'hardhat',
    'hyperledger-besu',
    'blockchain',
    'web3',
    'underpost-platform',
    'mmorpg',
  ],
  description:
    'Cyberia CLI — toolchain for the Cyberia MMO data layer, content pipeline, persistence, gRPC services, and ERC-1155 lifecycle on Hyperledger Besu.',
};
