/**
 * Prototype content catalog.
 *
 * A per-deploy product catalog for `dd-prototype` ERP/CRM prototype sources. Each `sourcePaths`
 * entry is a path the source repo owns at the same place as in the engine tree: `engine-prototype`
 * on the public channel, `engine-test-prototype` on the private one. The engine ignores these
 * paths, so the tree is the working copy and the repo its git view
 * (`node bin/build dd-prototype --sync-sources [--channel public]` mirrors one to the other).
 * @module src/projects/prototype/catalog-prototype.js
 * @namespace PrototypeCatalog
 */

export default {
  sourcePaths: [
    'src/api/healthcare-appointment',
    'src/client/components/bymyelectrics',
    'src/client/components/cecinasmarcelina',
    'src/client/components/healthcare',
    'src/client/public/bymyelectrics',
    'src/client/public/cecinasmarcelina',
    'src/client/public/healthcare',
    'src/client/services/healthcare-appointment',
    'src/client/Bymyelectrics.index.js',
    'src/client/Cecinasmarcelina.index.js',
    'src/client/Healthcare.index.js',
    'src/client/ssr/body/BymyelectricsSplashScreen.js',
    'src/client/ssr/body/CecinasmarcelinaSplashScreen.js',
    'src/client/ssr/body/HealthcareSplashScreen.js',
    'src/client/ssr/head/BymyelectricsScripts.js',
    'src/client/ssr/head/CecinasmarcelinaScripts.js',
    'src/client/ssr/head/HealthcareScripts.js',
    'src/client/ssr/head/PwaBymyelectrics.js',
    'src/client/ssr/head/PwaCecinasmarcelina.js',
    'src/client/ssr/head/PwaHealthcare.js',
  ],
  privateConfPaths: [],
  templatePaths: ['/src/projects/prototype'],
  keywords: [],
  description: '',
};
