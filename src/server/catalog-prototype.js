/**
 * Prototype content catalog.
 *
 * A per-deploy product catalog for `dd-prototype` ERP/CRM prototype sources
 * to be moved into the template for the `dd-prototype` PWA microservices template.
 * @module src/server/catalog-prototype.js
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
  ],
  privateConfPaths: [],
  templatePaths: [],
  stripPaths: [],
  keywords: [],
  description: '',
};
