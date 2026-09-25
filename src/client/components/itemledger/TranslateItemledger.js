import { Translate } from '../core/Translate.js';

class TranslateItemledger {
  static async instance() {
    Translate.Data['item-ledger-registry'] = {
      en: 'Registry',
      es: 'Registro',
    };
  }
}

export { TranslateItemledger };
