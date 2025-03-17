import { Translate } from '../core/Translate.js';
import { QuestComponent } from './CommonCyberia.js';

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
    Translate.Data['worlds'] = { en: 'Worlds', es: 'Mundos' };

    Translate.Data['color-chaos'] = { en: 'color chaos', es: 'color chaos' };

    Translate.Data['success-upload-world'] = { en: 'Success upload World(s)', es: 'Mundo subido con exito' };
    Translate.Data['error-upload-world'] = { en: 'error uploading World', es: 'error al subir el Mundo' };
    Translate.Data['success-world'] = { en: 'Success load World(s)', es: 'Mundo cargado con exito' };

    Translate.Data['space'] = { en: 'Space', es: 'Espacial' };

    Translate.Data['dismiss-quest'] = {
      en: 'Dismiss Quest',
      es: 'Abandonar Misión',
    };

    Translate.Data['take-quest'] = {
      en: 'Take Quest',
      es: 'Aceptar Misión',
    };

    {
      for (const key of Object.keys(QuestComponent.Data)) {
        const questData = QuestComponent.Data[key]();
        Translate.Data[`${key}-title`] = questData.title;
        Translate.Data[`${key}-description`] = questData.description;
        Translate.Data[`${key}-shortDescription`] = questData.shortDescription;
        Translate.Data[`${key}-successDescription`] = questData.successDescription;

        questData.provide.displayIds.forEach((provideData) =>
          provideData.stepData.forEach((stepData, i) => {
            Translate.Data[`${key}-completeDialog-step-${provideData.id}-${i}`] = stepData.completeDialog;
            if (stepData.talkingDialog)
              stepData.talkingDialog.map((dialogData, di) => {
                Translate.Data[`${key}-completeDialog-step-${provideData.id}-${i}-${di}`] = dialogData.dialog;
              });
          }),
        );
      }
    }
    {
      for (const key of Object.keys(QuestComponent.componentsScope)) {
        if (QuestComponent.componentsScope[key].defaultDialog)
          Translate.Data[`quest-${key}-defaultDialog`] = QuestComponent.componentsScope[key].defaultDialog;
      }
    }

    Translate.Data['insufficient-cash'] = {
      en: 'Insufficient coin cash balance',
      es: 'Saldo de monedas insuficiente',
    };
  },
};

export { TranslateCyberia };
