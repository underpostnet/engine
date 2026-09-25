import { Translate } from '../core/Translate.js';

class TranslateUnderpost {
  static async instance() {
    Translate.Data['contracultura-cyberpunk'] = { en: 'Contracultura Cyberpunk', es: 'Contracultura Cyberpunk' };
  }
}

export { TranslateUnderpost };
