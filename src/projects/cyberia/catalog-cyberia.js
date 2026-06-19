/**
 * Cyberia CLI content catalog.
 *
 * A per-deploy product catalog: pure data, loaded dynamically by deploy id via
 * {@link module:src/server/catalog} so the base build and template assembly never
 * statically depend on it. Exports the uniform product-catalog shape:
 *
 *   - `sourceMoves`       — public `[src, dest]` pairs moved into the engine tree before a build.
 *   - `privateConfPaths`  — extra payloads synced into the deploy's private repo.
 *   - `templatePaths`     — engine paths packaged into the standalone product CLI template.
 *   - `stripPaths`        — paths removed from the base `pwa-microservices-template`.
 *   - `keywords`          — npm keywords for the standalone product CLI package.
 *   - `description`       — npm description for the standalone product CLI package.
 *
 * @module src/projects/cyberia/catalog-cyberia.js
 * @namespace CyberiaCatalog
 */

export default {
  sourceMoves: [],
  privateConfPaths: ['cyberia-instances/FOREST'],
  templatePaths: [
    '/src/grpc/cyberia',
    '/src/client/ssr/views/CyberiaServerMetrics.js',
    '/test/shape-generator.test.js',
    '/src/projects/cyberia',
    '/src/runtime/cyberia-server',
    '/src/runtime/cyberia-client',
    '/.github/workflows/hardhat.ci.yml',
    '/src/client/public/cyberia-docs',
    '/src/api/cyberia-server-defaults',
  ],
  stripPaths: [
    './src/projects/cyberia',
    './src/grpc/cyberia',
    './src/runtime/cyberia-server',
    './src/runtime/cyberia-client',
    './test/shape-generator.test.js',
    './src/client/public/cyberia-docs',
    'bin/cyberia.js',
    './hardhat',
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
