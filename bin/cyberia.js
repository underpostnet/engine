import Jimp from 'jimp';
import { loggerFactory } from '../src/server/logger.js';
import sharp from 'sharp';
import fs from 'fs-extra';
import { range } from '../src/client/components/core/CommonJs.js';
import { hexa2Rgba } from '../src/api/cyberia-tile/cyberia-tile.service.js';
import dotenv from 'dotenv';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';

dotenv.config();

const logger = loggerFactory(import.meta);

// https://jimp-dev.github.io/jimp/api/jimp/classes/jimp/
// https://sharp.pixelplumbing.com/api-constructor

await logger.setUpInfo();

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;
const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];

await DataBaseProvider.load({ apis: ['cyberia-tile'], host, path, db });

/** @type {import('../src/api/cyberia-tile/cyberia-tile.model.js').CyberiaTileModel} */
const CyberiaTile = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaTile;

switch (process.argv[2]) {
  case 'build-item-skin':
    {
      const id08 = await CyberiaTile.findOne({ _id: process.argv[3] });
      // const id06 = await CyberiaTile.findOne({ _id: process.argv[4] });

      const imagePath = `./test.png`;

      const cellPixelDim = 20;

      let image = await sharp({
        create: {
          width: cellPixelDim * id08.color.length,
          height: cellPixelDim * id08.color.length,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // white
        },
      })
        .png()
        .toBuffer();

      fs.writeFileSync(imagePath, image);

      image = await Jimp.read(imagePath);

      let y_paint = 0;
      for (const y of range(0, id08.color.length - 1)) {
        let x_paint = 0;
        for (const x of range(0, id08.color.length - 1)) {
          for (const _y of range(0, cellPixelDim - 1)) {
            for (const _x of range(0, cellPixelDim - 1)) {
              image.setPixelColor(Jimp.rgbaToInt(...hexa2Rgba(id08.color[y][x], 255)), x_paint + _y, y_paint + _x);
            }
          }
          x_paint += cellPixelDim;
        }
        y_paint += cellPixelDim;
      }

      await image.write(imagePath);
    }

    break;

  default:
    break;
}

await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
