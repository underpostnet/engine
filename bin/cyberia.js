#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { shellExec, shellCd } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import {
  pngDirectoryIteratorByObjectLayerType,
  frameFactory,
  getKeyFramesDirectionsFromNumberFolderDirection,
  processAndPushFrame,
  buildImgFromTile,
  generateRandomStats,
  itemTypes,
} from '../src/server/object-layer.js';
import { program as underpostProgram } from '../src/cli/index.js';

import crypto from 'crypto';

shellCd(`/home/dd/engine`);

const logger = loggerFactory(import.meta);

const program = new Command();

const version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

program
  .name('cyberia')
  .description(
    `    cyberia online network object layer management ${version}
    https://www.cyberiaonline.com/object-layer-engine`,
  )
  .version(version);

program
  .command('ol')
  .option('--import [object-layer-type]', 'Commas separated object layer types e.g. skin,floors')
  .option('--show-frame <show-frame-input>', 'View object layer frame e.g. anon_08_0')
  .option('--env-path <env-path>', 'Env path e.g. ./engine-private/conf/dd-cyberia/.env.development')
  .option('--mongo-host <mongo-host>', 'Mongo host override')
  .action(async (options = { import: false, showFrame: '', envPath: '', mongoHost: '' }) => {
    if (!options.envPath) options.envPath = `./.env`;
    dotenv.config({ path: options.envPath, override: true });

    const deployId = process.env.DEFAULT_DEPLOY_ID;
    const host = process.env.DEFAULT_DEPLOY_HOST;
    const path = process.env.DEFAULT_DEPLOY_PATH;

    const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
    const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
    const { db } = confServer[host][path];

    db.host = options.mongoHost ? options.mongoHost : db.host.replace('127.0.0.1', 'mongodb-0.mongodb-service');

    logger.info('env', {
      env: options.envPath,
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
            }
            await processAndPushFrame(objectLayers[objectLayerId].data.render, path, direction);
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

program
  .command('underpost')
  .description('Underpost cli passthrough')
  .action(() => {
    throw new Error('Trigger underpost passthrough');
  });

try {
  // throw new Error('');
  program.parse();
} catch (error) {
  logger.error(error);
  process.argv = process.argv.filter((c) => c !== 'underpost');
  logger.warn('Rerouting to underpost cli...');
  try {
    underpostProgram.parse();
  } catch (error) {
    logger.error(error);
  }
}
