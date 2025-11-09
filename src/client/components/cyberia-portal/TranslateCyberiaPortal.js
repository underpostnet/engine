import { Translate } from '../core/Translate.js';

const TranslateCyberiaPortal = {
  Init: async function () {
    Translate.Data['object-layer-engine'] = {
      en: 'Object Layer Engine',
      es: 'Object Layer Engine',
    };
    Translate.Data['object-layer-engine-management'] = {
      en: 'Object Layer Management',
      es: 'Object Layer Management',
    };
    Translate.Data['object-layer-engine-viewer'] = {
      en: 'Object Layer Viewer',
      es: 'Object Layer Viewer',
    };
  },
};

export { TranslateCyberiaPortal };
