import { Translate } from './Translate.js';

const TranslateCore = {
  Init: async function () {
    Translate.Data['color-copy'] = { es: 'color copiado en el portapapeles', en: 'color copied to clipboard' };
    Translate.Data['pallet-colors'] = { en: 'pallet colors', es: 'paleta de colores' };
    Translate.Data['fullscreen'] = { en: 'fullscreen', es: 'pantalla completa' };
  },
};

export { TranslateCore };
