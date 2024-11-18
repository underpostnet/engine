import { loggerFactory } from '../src/server/logger.js';

import fs from 'fs-extra';
import { newInstance, range, s4 } from '../src/client/components/core/CommonJs.js';
import dotenv from 'dotenv';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { shellExec } from '../src/server/process.js';
import { PositionsComponent, QuestComponent } from '../src/client/components/cyberia/CommonCyberia.js';
import { buildImgFromTile } from '../src/api/cyberia-tile/cyberia-tile.service.js';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import toJsonSchema from 'to-json-schema';

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
    const cellPixelDim = 20;
    for (const position of PositionsComponent.default()) {
      if (tile08 && position.positionId === '08') {
        const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
        if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
        await buildImgFromTile({
          cellPixelDim,
          imagePath: `${folderPath}/0.png`,
          tile: tile08,
          opacityFilter: (x, y, color) => (color === tile08.color[0][0] ? 0 : 255),
        });
      }
      if (tile02 && position.positionId === '02') {
        const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
        if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
        await buildImgFromTile({
          cellPixelDim,
          imagePath: `${folderPath}/0.png`,
          tile: tile02,
          opacityFilter: (x, y, color) => (color === tile02.color[0][0] ? 0 : 255),
        });
      }
      if (tile06 && position.positionId === '06') {
        const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
        if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
        await buildImgFromTile({
          cellPixelDim,
          imagePath: `${folderPath}/0.png`,
          tile: tile06,
          opacityFilter: (x, y, color) => (color === tile06.color[0][0] ? 0 : 255),
        });
      }
      if (position.positionId === '04') {
        if (tile04) {
          const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
          if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
          await buildImgFromTile({
            cellPixelDim,
            imagePath: `${folderPath}/0.png`,
            tile: tile04,
            opacityFilter: (x, y, color) => (color === tile04.color[0][0] ? 0 : 255),
          });
        } else if (tile06) {
          const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
          if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });
          const tile04 = newInstance(tile06._doc);
          tile04.color = tile04.color.map((c) => c.reverse());
          await buildImgFromTile({
            cellPixelDim,
            imagePath: `${folderPath}/0.png`,
            tile: tile04,
            opacityFilter: (x, y, color) => (color === tile04.color[0][0] ? 0 : 255),
          });
        }
      }
      if (position.positionId[0] === '1') {
        const folderPath = `./src/client/public/cyberia/assets/${itemType}/${itemId}/${position.positionId}`;
        if (!fs.existsSync(folderPath)) fs.mkdirSync(`${folderPath}`, { recursive: true });

        const paint = {
          [`#000000`]: {
            0: [
              [9, 23],
              [10, 23],
            ],
            1: [
              [15, 23],
              [16, 23],
            ],
          },
        };

        const opacity = {
          0: [
            [9, 24],
            [10, 24],
          ],
          1: [
            [15, 24],
            [16, 24],
          ],
        };

        for (const frame of range(0, position.frames - 1)) {
          let tile;
          switch (position.positionId) {
            case '18':
              tile = newInstance(tile08._doc);
              break;
            case '16':
              tile = newInstance(tile06._doc);
              break;
            case '12':
              tile = newInstance(tile02._doc);
              break;
            case '14':
              {
                if (tile04) tile = newInstance(tile04._doc);
                else if (tile06) {
                  tile = newInstance(tile06._doc);
                  tile.color = tile.color.map((c) => c.reverse());
                }
              }
              break;
            default:
              break;
          }

          for (const hex of Object.keys(paint))
            for (const cord of paint[hex][frame]) tile.color[cord[1]][cord[0]] = hex;

          await buildImgFromTile({
            cellPixelDim,
            imagePath: `${folderPath}/${frame}.png`,
            tile,
            opacityFilter: (x, y, color) =>
              color === tile.color[0][0] || opacity[frame].find((c) => c[0] === x && c[1] === y) ? 0 : 255,
          });
        }
      }
    }
    break;
  }

  case 'create-quest': {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL_NAME = 'gemini-1.5-pro';

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME }); // 'gemini-1.5-flash'

    const generationConfig = {
      temperature: 0.9,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 1024,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const parts = [
      {
        text: `Generate json example instance for cyberpunk mmorpg quest. Please respond in the following JSON format:
        ${JSON.stringify(toJsonSchema(QuestComponent.Data['floki-bone']()), null, 4)}
    `,
      },
      // {
      //   inlineData: {
      //     mimeType: 'image/jpeg',
      //     data: imageBuffer.toString('base64'),
      //   },
      // },
    ];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
      safetySettings,
    });

    const response = result.response;

    console.log(
      response
        .text()
        .replace(/```json/g, '')
        .replace(/```/g, ''),
    );

    break;
  }

  default:
    break;
}

await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
