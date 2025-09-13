#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { pbcopy, shellExec } from '../src/server/process.js';
import Jimp from 'jimp';
import Underpost from '../src/index.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { range } from '../src/client/components/core/CommonJs.js';
import sharp from 'sharp';
import { random } from '../src/client/components/core/CommonJs.js';
import crypto from 'crypto';

dotenv.config({ path: `./engine-private/conf/dd-cyberia/.env.production`, override: true });

const logger = loggerFactory(import.meta);

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;

const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];

logger.info('env', {
  deployId,
  host,
  path,
  db,
});

await DataBaseProvider.load({
  apis: ['object-layer'],
  host,
  path,
  db,
});

const ObjectLayer = DataBaseProvider.instance[`${host}${path}`].mongoose.models.ObjectLayer;

await ObjectLayer.deleteMany();

const program = new Command();

program.name('cyberia').description(`content generator cli ${Underpost.version}`).version(Underpost.version);

const pngDirectoryIteratorByObjectLayerType = async (
  objectLayerType = 'skin',
  callback = ({ path, objectLayerType, objectLayerId, direction, frame }) => {},
) => {
  for (const objectLayerId of await fs.readdir(`./src/client/public/cyberia/assets/${objectLayerType}`)) {
    for (const direction of await fs.readdir(
      `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}`,
    )) {
      const dirFolder = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/${direction}`;
      if (!fs.statSync(dirFolder).isDirectory()) continue;
      for (const frame of await fs.readdir(dirFolder)) {
        const imageFilePath = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/${direction}/${frame}`;
        await callback({ path: imageFilePath, objectLayerType, objectLayerId, direction, frame });
      }
    }
  }
};

const frameFactory = async (path, colors = []) => {
  const frame = [];
  await new Promise((resolve) => {
    Jimp.read(path).then(async (image) => {
      const mazeFactor = parseInt(image.bitmap.height / 24);
      let _y = -1;
      for (const y of range(0, image.bitmap.height - 1)) {
        if (y % mazeFactor === 0) {
          _y++;
          if (!frame[_y]) frame[_y] = [];
        }
        let _x = -1;
        for (const x of range(0, image.bitmap.width - 1)) {
          const rgba = Object.values(Jimp.intToRGBA(image.getPixelColor(x, y)));
          if (y % mazeFactor === 0 && x % mazeFactor === 0) {
            _x++;
            const indexColor = colors.findIndex(
              (c) => c[0] === rgba[0] && c[1] === rgba[1] && c[2] === rgba[2] && c[3] === rgba[3],
            );
            if (indexColor === -1) {
              colors.push(rgba);
              frame[_y][_x] = colors.length - 1;
            } else {
              frame[_y][_x] = indexColor;
            }
          }
        }
      }
      resolve();
    });
  });
  return { frame, colors };
};

const getKeyFramesDirectionsFromNumberFolderDirection = (direction) => {
  let objectLayerFrameDirections = [];

  switch (direction) {
    case '08':
      objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
      break;
    case '18':
      objectLayerFrameDirections = ['down_walking'];
      break;
    case '02':
      objectLayerFrameDirections = ['up_idle'];
      break;
    case '12':
      objectLayerFrameDirections = ['up_walking'];
      break;
    case '04':
      objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
      break;
    case '14':
      objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
      break;
    case '06':
      objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
      break;
    case '16':
      objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
      break;
  }

  return objectLayerFrameDirections;
};

const buildImgFromTile = async (
  options = {
    tile: { map_color: null, frame_matrix: null },
    imagePath: '',
    cellPixelDim: 20,
    opacityFilter: (x, y, color) => 255,
  },
) => {
  const { tile, imagePath, cellPixelDim, opacityFilter } = options;
  const mainMatrix = tile.frame_matrix;
  const sharpOptions = {
    create: {
      width: cellPixelDim * mainMatrix[0].length,
      height: cellPixelDim * mainMatrix.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent background
    },
  };

  let image = await sharp(sharpOptions).png().toBuffer();
  fs.writeFileSync(imagePath, image);
  image = await Jimp.read(imagePath);

  for (let y = 0; y < mainMatrix.length; y++) {
    for (let x = 0; x < mainMatrix[y].length; x++) {
      const colorIndex = mainMatrix[y][x];
      if (colorIndex === null || colorIndex === undefined) continue;

      const color = tile.map_color[colorIndex];
      if (!color) continue;

      const rgbaColor = color.length === 4 ? color : [...color, 255]; // Ensure alpha channel

      for (let dy = 0; dy < cellPixelDim; dy++) {
        for (let dx = 0; dx < cellPixelDim; dx++) {
          const pixelX = x * cellPixelDim + dx;
          const pixelY = y * cellPixelDim + dy;
          image.setPixelColor(Jimp.rgbaToInt(...rgbaColor), pixelX, pixelY);
        }
      }
    }
  }

  await image.writeAsync(imagePath);
};

const generateRandomStats = () => {
  return {
    effect: random(0, 10),
    resistance: random(0, 10),
    agility: random(0, 10),
    range: random(0, 10),
    intelligence: random(0, 10),
    utility: random(0, 10),
  };
};

program
  .command('ol')
  .option('--import [object-layer-type]', 'Import object layer from type storage png image')
  .option('--show-frame <show-frame-input>', 'View object layer frame e.g. anon_08_0')
  .action(async (options = { import: false, showFrame: '' }) => {
    const objectLayers = {};

    if (options.import || options.showFrame) {
      await pngDirectoryIteratorByObjectLayerType(
        options.import,
        async ({ path, objectLayerType, objectLayerId, direction, frame }) => {
          if (options.showFrame && !`${objectLayerId}_${direction}_${frame}`.match(options.showFrame)) return;
          console.log(path, { objectLayerType, objectLayerId, direction, frame });
          if (!objectLayers[objectLayerId])
            objectLayers[objectLayerId] = {
              data: {
                render: {
                  colors: [],
                  frames: {},
                  frame_duration: 250,
                  is_stateless: false,
                },
                item: {
                  id: objectLayerId,
                  type: objectLayerType,
                  description: '',
                  activable: true,
                },
                stats: generateRandomStats(),
              },
            };
          const frameFactoryResult = await frameFactory(path, objectLayers[objectLayerId].data.render.colors);
          objectLayers[objectLayerId].data.render.colors = frameFactoryResult.colors;
          for (const objectLayerFrameDirection of getKeyFramesDirectionsFromNumberFolderDirection(direction)) {
            if (!objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection])
              objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection] = [];
            objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection].push(frameFactoryResult.frame);
          }
        },
      );
      for (const objectLayerId of Object.keys(objectLayers)) {
        objectLayers[objectLayerId].sha256 = crypto
          .createHash('sha256')
          .update(JSON.stringify(objectLayers[objectLayerId].data))
          .digest('hex');
        console.log(await ObjectLayer.create(objectLayers[objectLayerId]));
      }
    }
    if (options.showFrame) {
      const [objectLayerId, direction, frame] = options.showFrame.split('_');
      const objectLayerFrameDirection = getKeyFramesDirectionsFromNumberFolderDirection(direction)[0];

      await buildImgFromTile({
        tile: {
          map_color: objectLayers[objectLayerId].data.render.colors,
          frame_matrix: objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection][0],
        },
        cellPixelDim: 20,
        opacityFilter: (x, y, color) => 255,
        imagePath: `./${options.showFrame}.png`,
      });

      shellExec(`firefox ./${options.showFrame}.png`);
    }
    await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  })
  .description('Object layer management');

program.parse();
