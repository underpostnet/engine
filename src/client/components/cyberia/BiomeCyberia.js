import { CyberiaBiomeService } from '../../services/cyberia-biome/cyberia-biome.service.js';
import { FileService } from '../../services/file/file.service.js';

import { loggerFactory } from '../core/Logger.js';
import { htmls, s } from '../core/VanillaJs.js';

import {
  getCollisionMatrixCyberia,
  getRandomAvailablePositionCyberia,
  isBiomeCyberiaCollision,
} from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { PointAndClickMovementCyberia } from './PointAndClickMovementCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const logger = loggerFactory(import.meta);

const getBiomeId = (params) => `biome-${params.data._id}`;

const BiomeCyberiaScope = {
  Keys: {},
  Data: {},
  Grid: [],
};

const BiomeCyberiaManagement = {
  loadData: async function (params) {
    const rowId = getBiomeId(params);

    if (!(rowId in BiomeCyberiaScope.Data)) {
      const resultBiomeCyberia = await CyberiaBiomeService.get({ id: params.data._id });

      const biomeData = resultBiomeCyberia.data[0];

      const resultFile = await FileService.get({ id: biomeData.fileId });

      const imageData = resultFile.data[0];

      const imageBlob = new Blob([new Uint8Array(imageData.data.data)], { type: imageData.mimetype });

      const imageFile = new File([imageBlob], imageData.name, { type: imageData.mimetype });

      const imageSrc = URL.createObjectURL(imageFile);

      const resultTopLevelColorFile = await FileService.get({ id: biomeData.topLevelColorFileId });

      const imageTopLevelColorData = resultTopLevelColorFile.data[0];

      const imageTopLevelColorBlob = new Blob([new Uint8Array(imageTopLevelColorData.data.data)], {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorFile = new File([imageTopLevelColorBlob], imageTopLevelColorData.name, {
        type: imageTopLevelColorData.mimetype,
      });

      const imageTopLevelColorSrc = URL.createObjectURL(imageTopLevelColorFile);

      biomeData.color = Object.assign(
        {},
        biomeData.color.map((cell) => Object.assign({}, cell)),
      );
      biomeData.topLevelColor = Object.assign(
        {},
        biomeData.topLevelColor.map((cell) => Object.assign({}, cell)),
      );
      biomeData.solid = Object.assign(
        {},
        biomeData.solid.map((cell) => Object.assign({}, cell)),
      );

      BiomeCyberiaScope.Data[rowId] = {
        ...biomeData,
        imageFile,
        imageSrc,
        imageTopLevelColorFile,
        imageTopLevelColorSrc,
        mainUserCollisionMatrixCyberia: getCollisionMatrixCyberia(biomeData, ElementsCyberia.Data.user.main),
      };
    }

    return BiomeCyberiaScope.Data[rowId];
  },
  load: async function (params) {
    const rowId = getBiomeId(params);
    MatrixCyberia.Data.biomeDataId = rowId;
    if (BiomeCyberiaScope.Data[rowId].dim) MatrixCyberia.Data.dim = BiomeCyberiaScope.Data[rowId].dim;
    if (BiomeCyberiaScope.Data[rowId].dimPaintByCell)
      MatrixCyberia.Data.dimPaintByCell = BiomeCyberiaScope.Data[rowId].dimPaintByCell;
    if (BiomeCyberiaScope.Data[rowId].dimAmplitude)
      MatrixCyberia.Data.dimAmplitude = BiomeCyberiaScope.Data[rowId].dimAmplitude;
    PixiCyberia.setResponsivePixiContainerEvent();
    PixiCyberia.setMainUserMovementController();
    PixiCyberia.setFloor(BiomeCyberiaScope.Data[rowId].imageSrc);
    PixiCyberia.setFloorTopLevelColor(BiomeCyberiaScope.Data[rowId].imageTopLevelColorSrc);
    await PixiCyberia.setMapComponents();
    PointAndClickMovementCyberia.callback();
    {
      const type = 'user';
      const id = 'main';
      htmls(
        `.map-name-icon-container`,
        html`
          ${WorldCyberiaManagement.Data[type][id].model.world.name} ${BiomeCyberiaScope.Data[rowId].name}
          ${WorldCyberiaManagement.Data[type][id].model.world.instance[
            ElementsCyberia.Data[type][id].model.world.face - 1
          ].type}
          - F${ElementsCyberia.Data[type][id].model.world.face}
        `,
      );
      s(`.map-name-icon-container`).onclick = () => {
        s(`.cy-int-btn-map`).click();
      };
    }
  },
  isBiomeCyberiaCollision: function (options) {
    const { type, id, x, y } = options;
    const biomeData = options.biome ? options.biome : BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId];
    return isBiomeCyberiaCollision({ element: ElementsCyberia.Data[type][id], biomeData, x, y });
  },
  getRandomAvailablePositionCyberia: function (options) {
    const { type, id } = options;
    const biomeData = options.biome ? options.biome : BiomeCyberiaScope.Data[MatrixCyberia.Data.biomeDataId];
    return getRandomAvailablePositionCyberia({ element: ElementsCyberia.Data[type][id], biomeData });
  },
};

export { BiomeCyberiaScope, BiomeCyberiaManagement };
