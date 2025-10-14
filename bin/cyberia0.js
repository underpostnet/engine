#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { shellExec } from '../src/server/process.js';
import Underpost from '../src/index.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import {
  pngDirectoryIteratorByObjectLayerType,
  frameFactory,
  getKeyFramesDirectionsFromNumberFolderDirection,
  buildImgFromTile,
  generateRandomStats,
  itemTypes,
} from '../src/server/object-layer.js';

import crypto from 'crypto';

dotenv.config({ path: `./engine-private/conf/dd-cyberia/.env.production`, override: true });

const logger = loggerFactory(import.meta);

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;

const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];

db.host = db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

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

program
  .command('ol')
  .option('--import [object-layer-type]', 'Commas separated object layer types e.g. skin,floors')
  .option('--show-frame <show-frame-input>', 'View object layer frame e.g. anon_08_0')
  .action(async (options = { import: false, showFrame: '' }) => {
    const objectLayers = {};

    if (options.import || options.showFrame) {
      const argItemTypes = options.import === 'all' ? Object.keys(itemTypes) : options.import.split(',');
      for (const argItemType of argItemTypes) {
        await pngDirectoryIteratorByObjectLayerType(
          argItemType,
          async ({ path, objectLayerType, objectLayerId, direction, frame }) => {
            if (options.showFrame && !`${objectLayerId}_${direction}_${frame}`.match(options.showFrame)) return;
            console.log(path, { objectLayerType, objectLayerId, direction, frame });
            if (!objectLayers[objectLayerId]) {
              const metadataPath = `./src/client/public/cyberia/assets/${objectLayerType}/${objectLayerId}/metadata.json`;
              const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null;
              objectLayers[objectLayerId] = metadata
                ? metadata
                : {
                    data: {
                      render: {
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
              objectLayers[objectLayerId].data.render.colors = [];
              objectLayers[objectLayerId].data.render.frames = {};
            }
            const frameFactoryResult = await frameFactory(path, objectLayers[objectLayerId].data.render.colors);
            objectLayers[objectLayerId].data.render.colors = frameFactoryResult.colors;
            for (const objectLayerFrameDirection of getKeyFramesDirectionsFromNumberFolderDirection(direction)) {
              if (!objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection])
                objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection] = [];
              objectLayers[objectLayerId].data.render.frames[objectLayerFrameDirection].push(frameFactoryResult.frame);
            }
          },
        );
      }
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
