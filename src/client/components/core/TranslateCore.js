import { Translate } from './Translate.js';

const TranslateCore = {
  Init: async function () {
    Translate.Data['color-copy'] = { es: 'color copiado en el portapapeles', en: 'color copied to clipboard' };
    Translate.Data['pallet-colors'] = { en: 'pallet colors', es: 'paleta de colores' };
    Translate.Data['fullscreen'] = { en: 'fullscreen', es: 'pantalla completa' };
    Translate.Data['lang'] = { en: 'Language', es: 'Idioma' };
    Translate.Data['select'] = { en: 'Select', es: 'Seleccionar' };
    Translate.Data['close'] = { en: 'Close', es: 'Cerrar' };
    Translate.Data['en'] = { en: 'English', es: 'Ingles' };
    Translate.Data['es'] = { en: 'Spanish', es: 'Español' };
    Translate.Data['theme'] = { en: 'Theme', es: 'Tema' };
  },
};

export { TranslateCore };
