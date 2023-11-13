import { Translate } from '../core/Translate.js';

const TranslateCyberia = {
  Init: async function () {
    Translate.Data['bag'] = { en: 'bag', es: 'mochila' };
    Translate.Data['settings'] = { en: 'settings', es: 'configuraciones' };
  },
};

export { TranslateCyberia };
