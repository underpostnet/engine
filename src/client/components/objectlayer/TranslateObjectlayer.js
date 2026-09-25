import { Translate } from '../core/Translate.js';

class TranslateObjectlayer {
  static async instance() {
    Translate.Data['object-layer-engine-viewer'] = {
      en: 'Explorer',
      es: 'Explorador',
    };
  }
}

export { TranslateObjectlayer };
