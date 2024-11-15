import { loggerFactory } from '../src/server/logger.js';

import fs from 'fs-extra';
import { range, s4 } from '../src/client/components/core/CommonJs.js';
import dotenv from 'dotenv';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { shellExec } from '../src/server/process.js';
import { PositionsComponent } from '../src/client/components/cyberia/CommonCyberia.js';
import { buildImgFromTile } from '../src/api/cyberia-tile/cyberia-tile.service.js';

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
  case 'view-tile':
    {
      const tile = await CyberiaTile.findOne({ _id: process.argv[3] });

      if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`);
      const imagePath = `./tmp/${s4()}-${s4()}-${s4()}.png`;

      const cellPixelDim = 20;
      await buildImgFromTile({
        cellPixelDim,
        imagePath,
        tile,
      });

      setTimeout(() => {
        shellExec(`xdg-open ${imagePath}`);
        fs.removeSync(imagePath);
      });
    }

    break;

  case 'build-asset': {
    const itemType = process.argv[3];
    const itemId = process.argv[4] === '-' ? s4() + s4() + s4() : process.argv[4];
    const tile08 = process.argv[5] ? await CyberiaTile.findOne({ _id: process.argv[5] }) : undefined;
    const tile02 = process.argv[6] ? await CyberiaTile.findOne({ _id: process.argv[6] }) : undefined;
    const tile06 = process.argv[7] ? await CyberiaTile.findOne({ _id: process.argv[7] }) : undefined;
    const tile04 = process.argv[8] ? await CyberiaTile.findOne({ _id: process.argv[8] }) : undefined;

    for (const position of PositionsComponent.default()) {
      if (tile08 && position.positionId === '08') {
        const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
        if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
        await buildImgFromTile({
          cellPixelDim: 20,
          imagePath: `${folderPath}/0.png`,
          tile: tile08,
          opacityFilter: (color) => (color === tile08.color[0][0] ? 0 : 255),
        });
      }
    }
    break;
  }

  default:
    break;
}

await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
