import { Translate } from '../core/Translate.js';

class TranslateCyberiaPortal {
  static async Init() {
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
    Translate.Data['cyberia-map-engine'] = {
      en: 'Cyberia Map Engine',
      es: 'Cyberia Map Engine',
    };
    Translate.Data['cyberia-instance-engine'] = {
      en: 'Cyberia Instance Engine',
      es: 'Cyberia Instance Engine',
    };
  }
}

export { TranslateCyberiaPortal };
