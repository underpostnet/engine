import { Translate } from '../core/Translate.js';

const TranslateCyberia = {
  Init: async function () {
    Translate.Data['bag'] = { en: 'bag', es: 'mochila' };
    Translate.Data['settings'] = { en: 'settings', es: 'configuraciones' };
    Translate.Data['city'] = { en: 'City', es: 'ciudad' };
    Translate.Data['forest'] = { en: 'forest', es: 'bosque' };
    Translate.Data['success-upload-biome'] = { en: 'biome uploaded successfully', es: 'Bioma subido correctamente' };
    Translate.Data['error-upload-biome'] = { en: 'error uploading biome', es: 'error al subir el bioma' };
    Translate.Data['search-biome'] = { en: 'search biome', es: 'buscar bioma' };
  },
};

export { TranslateCyberia };
