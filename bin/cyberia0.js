#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import fs from 'fs-extra';
import { pbcopy, shellExec } from '../src/server/process.js';
import Jimp from 'jimp';
import Underpost from '../src/index.js';
import { loggerFactory } from '../src/server/logger.js';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';

dotenv.config();

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

const program = new Command();

program.name('cyberia').description(`content generator cli ${Underpost.version}`).version(Underpost.version);

program
  .command('ol')
  .option('--import [object-layer-type]', 'Import object layer from type storage png image')
  .action(async (options = { import: false }) => {
    if (options.import) {
      const ObjectLayerType = options.import;
      for (const objectLayerId of await fs.readdir(`./src/client/public/cyberia/assets/${ObjectLayerType}`)) {
        for (const direction of await fs.readdir(
          `./src/client/public/cyberia/assets/${ObjectLayerType}/${objectLayerId}`,
        )) {
          const dirFolder = `./src/client/public/cyberia/assets/${ObjectLayerType}/${objectLayerId}/${direction}`;
          if (!fs.statSync(dirFolder).isDirectory()) continue;
          for (const frame of await fs.readdir(dirFolder)) {
            const imageFilePath = `./src/client/public/cyberia/assets/${ObjectLayerType}/${objectLayerId}/${direction}/${frame}`;
            console.log(imageFilePath, fs.existsSync(imageFilePath));
          }
        }
      }
    }
    await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  })
  .description('Object layer management');

program.parse();
