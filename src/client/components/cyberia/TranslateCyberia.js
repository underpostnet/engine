import { Translate } from '../core/Translate.js';

const TranslateCyberia = {
  Init: async function () {
    Translate.Data['bag'] = { en: 'bag', es: 'mochila' };
    Translate.Data['city'] = { en: 'City', es: 'ciudad' };
    Translate.Data['forest'] = { en: 'forest', es: 'bosque' };
    Translate.Data['seed-city'] = { en: 'seed city', es: 'ciudad semilla' };

    Translate.Data['success-upload-biome'] = { en: 'biome uploaded successfully', es: 'Bioma subido correctamente' };
    Translate.Data['error-upload-biome'] = { en: 'error uploading biome', es: 'error al subir el bioma' };
    Translate.Data['search-biome'] = { en: 'search biome', es: 'buscar bioma' };
    Translate.Data['select-biome'] = { en: 'select biome', es: 'seleccionar bioma' };
    Translate.Data['create-biome'] = { en: 'create biome', es: 'crear bioma' };
    Translate.Data['config-biome'] = { en: 'biome settings', es: 'Configuración del bioma' };
    Translate.Data['biome-type'] = { en: 'Biome type', es: 'Seleccionar bioma' };
    Translate.Data['biomes'] = { en: 'Biomes', es: 'Biomas' };
    Translate.Data['biome-image'] = { en: 'Image', es: 'Imagen' };
    Translate.Data['biome-solid'] = { en: 'Object matrix', es: 'Matriz de Objetos' };
    Translate.Data['success-biome'] = { en: 'Success load biome(s)', es: 'Biomas cargados con exito' };

    Translate.Data['config-tiles'] = { en: 'tile settings', es: 'Configuración del tile' };
    Translate.Data['tiles'] = { en: 'tiles', es: 'tiles' };
    Translate.Data['tile'] = { en: 'tile', es: 'tile' };
    Translate.Data['success-upload-tile'] = { en: 'Success upload tile(s)', es: 'Tile subido con exito' };
    Translate.Data['error-upload-tile'] = { en: 'error uploading tile', es: 'error al subir el Tile' };
    Translate.Data['success-tile'] = { en: 'Success load tile(s)', es: 'Tile cargado con exito' };

    Translate.Data['config'] = { en: 'Setting', es: 'configuración' };

    Translate.Data['world'] = { en: 'World', es: 'Mundo' };

    Translate.Data['color-chaos'] = { en: 'color chaos', es: 'color chaos' };
  },
};

export { TranslateCyberia };
