/**
 * Prototype content catalog.
 *
 * A per-deploy product catalog for `dd-prototype` ERP/CRM prototype sources
 * to be moved into the template for the `dd-prototype` PWA microservices template.
 * @module src/projects/prototype/catalog-prototype.js
 * @namespace PrototypeCatalog
 */

export default {
  sourceMoves: [
    ['../engine-prototype/src/api/healthcare-appointment', 'src/api/healthcare-appointment'],
    ['../engine-prototype/src/client/components/bymyelectrics', 'src/client/components/bymyelectrics'],
    ['../engine-prototype/src/client/components/cecinasmarcelina', 'src/client/components/cecinasmarcelina'],
    ['../engine-prototype/src/client/components/healthcare', 'src/client/components/healthcare'],
    ['../engine-prototype/src/client/public/bymyelectrics', 'src/client/public/bymyelectrics'],
    ['../engine-prototype/src/client/public/cecinasmarcelina', 'src/client/public/cecinasmarcelina'],
    ['../engine-prototype/src/client/public/healthcare', 'src/client/public/healthcare'],
    ['../engine-prototype/src/client/services/healthcare-appointment', 'src/client/services/healthcare-appointment'],
    ['../engine-prototype/src/client/Bymyelectrics.index.js', 'src/client/Bymyelectrics.index.js'],
    ['../engine-prototype/src/client/Cecinasmarcelina.index.js', 'src/client/Cecinasmarcelina.index.js'],
    ['../engine-prototype/src/client/Healthcare.index.js', 'src/client/Healthcare.index.js'],
    [
      '../engine-prototype/src/client/ssr/body/BymyelectricsSplashScreen.js',
      'src/client/ssr/body/BymyelectricsSplashScreen.js',
    ],
    [
      '../engine-prototype/src/client/ssr/body/CecinasmarcelinaSplashScreen.js',
      'src/client/ssr/body/CecinasmarcelinaSplashScreen.js',
    ],
    [
      '../engine-prototype/src/client/ssr/body/HealthcareSplashScreen.js',
      'src/client/ssr/body/HealthcareSplashScreen.js',
    ],
    ['../engine-prototype/src/client/ssr/head/BymyelectricsScripts.js', 'src/client/ssr/head/BymyelectricsScripts.js'],
    [
      '../engine-prototype/src/client/ssr/head/CecinasmarcelinaScripts.js',
      'src/client/ssr/head/CecinasmarcelinaScripts.js',
    ],
    ['../engine-prototype/src/client/ssr/head/HealthcareScripts.js', 'src/client/ssr/head/HealthcareScripts.js'],
    ['../engine-prototype/src/client/ssr/head/PwaBymyelectrics.js', 'src/client/ssr/head/PwaBymyelectrics.js'],
    ['../engine-prototype/src/client/ssr/head/PwaCecinasmarcelina.js', 'src/client/ssr/head/PwaCecinasmarcelina.js'],
    ['../engine-prototype/src/client/ssr/head/PwaHealthcare.js', 'src/client/ssr/head/PwaHealthcare.js'],
  ],
  privateConfPaths: [],
  templatePaths: ['/src/projects/prototype'],
  stripPaths: ['./src/projects/prototype'],
  keywords: [],
  description: '',
};
