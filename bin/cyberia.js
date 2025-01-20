import { loggerFactory } from '../src/server/logger.js';

import fs from 'fs-extra';
import { newInstance, range, s4 } from '../src/client/components/core/CommonJs.js';
import dotenv from 'dotenv';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { shellExec } from '../src/server/process.js';
import { LoreCyberia, PositionsComponent, QuestComponent } from '../src/client/components/cyberia/CommonCyberia.js';
import { buildImgFromTile, getHexMatrix, setTransparency } from '../src/api/cyberia-tile/cyberia-tile.service.js';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import ejs from 'easy-json-schema';
import Jimp from 'jimp';

dotenv.config();

const logger = loggerFactory(import.meta);

// https://jimp-dev.github.io/jimp/api/jimp/classes/jimp/
// https://sharp.pixelplumbing.com/api-constructor

await logger.setUpInfo();

// node bin/cyberia view-tile 673749f805105f93d69ed853
// node bin/cyberia build-asset skin test 673749f805105f93d69ed853 67374a4405105f93d69ed859 67374a5c05105f93d69ed85f

// node bin/cyberia build-asset skin gp0 6737b57da9a796baa8d4a50d 6737b59fa9a796baa8d4a513 6737b569a9a796baa8d4a507
// node bin/cyberia build-asset skin gp1 6737b5c9a9a796baa8d4a519 6737b5f0a9a796baa8d4a51f 6737b612a9a796baa8d4a525

// node bin/cyberia build-asset skin marciano 6737d7d34145a0e1dd4849ba 6737d80b4145a0e1dd4849c6 6737da8f4145a0e1dd4849ec

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;
const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];
const platformSuffix = process.platform === 'linux' ? '' : 'C:';
const commonCyberiaPath = `src/client/components/cyberia/CommonCyberia.js`;

await DataBaseProvider.load({
  apis: ['cyberia-tile', 'cyberia-biome', 'cyberia-instance', 'cyberia-world'],
  host,
  path,
  db,
});

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
    const metanarrative = `For a cyberpunk mmorpg, whose narrative context is about: '${JSON.stringify(
      LoreCyberia,
      null,
      4,
    )
      .replaceAll('{', '')
      .replaceAll('}', '')
      .replaceAll('"', '')}.'`;

    const keyPrompt = 'c';
    const mdPath = './engine-private/cyberia-universes/odisea/prompt-md-outputs/';

    const prompt = {
      a: () => {
        const context = `The mission is called 'Odyssey Seller', and it is about the player 
        finding the seller looking for a resource extraction item, since Odyssey Outfitting 
        of the Atlas Confederation (it is a retailer of items for the extraction of planetary 
        natural resources of all kinds, such as axes, pickaxes, ropes, safety equipment, etc.) 
        then he is offered a product from the catalogue, all  he has to do is buy one or more 
        items to complete the mission.`;

        return `${metanarrative}, and this micro context '${context}', 
        Generate quest json example instance, following this JSON format example:
        ${JSON.stringify(QuestComponent.Data['floki-bone'](), null, 4)}
    `;
      },
      b: () => {
        return `${metanarrative}, write the narrative of a saga, which deals with a camouflaged 
        intrusion of the impeior zenith on the atlas cofederation through 'odisea outfitinng retail' 
        a (retail sale of  tools for extraction planetary resources of atlas confederation), create 
        at least 3 characters that will be seen throughout the saga as the playing gets 
        into complexing with plotwits.`;
      },
      c: () => {
        const context = `and the current saga is about: ${fs.readFileSync(
          `${mdPath}cyberia-lore-odyssey-saga.md`,
          'utf8',
        )}, Generate first quest saga json example instance, following this JSON format example:
        ${JSON.stringify(QuestComponent.Data['floki-bone'](), null, 4)}`;
        return `${metanarrative}, ${context}`;
      },
      _: () => {
        const context = ``;
        return `${metanarrative}, `;
      },
    };

    logger.info('config', {
      prompt: prompt[keyPrompt](),
    });
    const parts = [
      {
        text: prompt[keyPrompt](),
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
      // generationConfig,
      safetySettings,
    });

    const response = result.response;

    try {
      switch (keyPrompt) {
        case 'c':
        case 'a': {
          const json = response
            .text()
            .replace(/```json/g, '')
            .replace(/```/g, '');
          fs.writeFileSync('./out.json', json, 'utf8');
          break;
        }

        case 'b': {
          fs.writeFileSync('./engine-private/cyberia-universes/prompt-md-outputs/out.md', response.text(), 'utf8');
          break;
        }
        default:
          break;
      }
    } catch (error) {
      logger.error(error);
    }

    break;
  }

  case 'export-universe': {
    const universeId = process.argv[3];
    const collections = ['cyberiabiomes', 'cyberiaworlds', 'cyberiainstances'];
    const outputPath = `./engine-private/cyberia-universes/${universeId}`;
    // --host <hostname> --port <port> --username <username> --password <password>
    if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
    if (!fs.existsSync(outputPath + '-files')) fs.mkdirSync(outputPath + '-files', { recursive: true });
    for (const collection of collections) {
      shellExec(`mongodump --db ${db.name} --collection ${collection} -o ${outputPath}`);
    }
    shellExec(`mongodump --db ${db.name} --collection ${'files'} -o ${outputPath}-files`);

    break;
  }

  case 'import-universe': {
    const universeId = process.argv[3];
    const collections = ['cyberiabiomes', 'cyberiaworlds', 'cyberiainstances'];
    const outputPath = `./engine-private/cyberia-universes/${universeId}`;
    // --host <hostname> --port <port> --username <username> --password <password>
    if (!fs.existsSync(outputPath)) {
      logger.error('Could not find output path', outputPath);
      break;
    }
    shellExec(`mongorestore -d ${db.name} ${outputPath}/${db.name} --drop --preserveUUID`);
    shellExec(`mongorestore -d ${db.name} ${outputPath}-files/${db.name}`);
    break;
    for (const collection of collections) {
    }

    break;
  }
  case 'vector-full': {
    shellExec(`node bin/cyberia vector-jpg ; node bin/cyberia vector-svg`);
    break;
  }
  case 'vector-svg':
  case 'vector-jpg': {
    // https://github.com/visioncortex/vtracer
    // curl https://sh.rustup.rs -sSf | sh
    // /root/.cargo/bin/cargo
    // cargo install vtracer

    const path = `./src/client/public/cyberia/assets/lore`; // lore
    const files = await fs.readdir(path);
    for (const file of files) {
      const fullPath = `${path}/${file}`;
      if (fs.statSync(fullPath).isDirectory()) continue;

      const savePath = `${path}/vectorized`;
      if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });
      const color = await getHexMatrix({ imageFilePath: fullPath, pixelate: 1 }, 170, 1); // lore
      // const color = await getHexMatrix({ imageFilePath: fullPath, pixelate: 2 }, 100, 1);

      const newFile = `${file.split('.')[0]}.jpg`;

      const newSvgFile = `${file.split('.')[0]}.svg`;

      switch (process.argv[2]) {
        case 'vector-svg':
          shellExec(
            `vtracer --input /dd/engine${savePath.slice(1)}/${newFile} --output /dd/engine${savePath.slice(
              1,
            )}/${newSvgFile}`,
          );
          break;

        default:
          await buildImgFromTile({
            cellPixelDim: 4, // lore
            // cellPixelDim: 20,
            imagePath: `${savePath}/${newFile}`, // .png
            tile: { color },
            // opacityFilter: (x, y, _color) => (_color === color[0][0] ? 0 : 255),
          });

          break;
      }
    }
  }

  case 'gen-ai-asset': {
    const resourceFolder = process.argv[3] || 'sprites';
    const resourceFile = process.argv[4] || 'Gemini_Generated_Image_ytdwclytdwclytdw.jpeg';
    const resourceFormat = resourceFile.split('.').pop();
    shellExec(`python --version`);
    shellExec(
      // `python ${platformSuffix}/dd/lab/src/pil-rembg.py` +
      // `rembg i` +
      `backgroundremover` +
        ` -i ${platformSuffix}/dd/engine/src/client/public/cyberia/assets/ai-resources/${resourceFolder}/${resourceFile}` +
        ` -o ${platformSuffix}/dd/engine/src/client/public/cyberia/assets/ai-resources/${resourceFolder}/${resourceFile}`.replace(
          '.' + resourceFormat,
          // '',
          '-alpha.' + resourceFormat,
        ),
    );
    shellExec(
      `python ${platformSuffix}/dd/lab/src/cv2-sprite-sheet-0.py` +
        ` ${platformSuffix}/dd/engine/src/client/public/cyberia/assets/ai-resources/${resourceFolder}/${resourceFile}`.replace(
          '.' + resourceFormat,
          // '',
          '-alpha.' + resourceFormat,
        ) +
        ` ${platformSuffix}/dd/engine/src/client/public/cyberia/assets/ai-resources/${resourceFolder}/${resourceFile}`.replace(
          '.' + resourceFormat,
          '',
        ),
    );
    break;
  }

  case 'build-ai-skin': {
    const displayId = 'green';
    const frameColor = 'rgba(255, 255, 255)';
    const buildFrame = async (pos) => {
      return await new Promise((resolve) => {
        Jimp.read(`./src/client/public/cyberia/assets/skin/${displayId}/0${pos}.png`).then(async (image) => {
          const dim = image.bitmap.width > image.bitmap.height ? image.bitmap.width : image.bitmap.height;
          if (!fs.existsSync(`./src/client/public/cyberia/assets/skin/${displayId}/0${pos}`))
            fs.mkdirSync(`./src/client/public/cyberia/assets/skin/${displayId}/0${pos}`, { recursive: true });

          const frame = new Jimp(dim + dim * 0.25, dim + dim * 0.25, frameColor);

          frame.composite(
            image,
            (frame.bitmap.width - image.bitmap.width) / 2,
            (frame.bitmap.height - image.bitmap.height) / 2,
          );

          frame.resize(500, 500);

          const outPath = `/dd/engine/src/client/public/cyberia/assets/skin/${displayId}/0${pos}/0.png`;

          await setTransparency(frame);

          frame.write(outPath);

          if (!fs.existsSync(`./src/client/public/cyberia/assets/skin/${displayId}/1${pos}`))
            fs.mkdirSync(`./src/client/public/cyberia/assets/skin/${displayId}/1${pos}`, { recursive: true });

          for (const _pos of range(0, 1)) {
            const frame = new Jimp(dim + dim * 0.25, dim + dim * 0.25, frameColor);

            frame.composite(
              image,
              (frame.bitmap.width - image.bitmap.width) / 2,
              (frame.bitmap.height - image.bitmap.height) / (_pos === 0 ? 2.3 : 1.7),
            );

            frame.resize(500, 500);

            const outPath = `/dd/engine/src/client/public/cyberia/assets/skin/${displayId}/1${pos}/${_pos}.png`;

            await setTransparency(frame);

            frame.write(outPath);
          }

          return resolve();
        });
      });
    };
    for (const position of [2, 8, 6, 4]) await buildFrame(position);

    fs.writeFileSync(
      commonCyberiaPath,
      fs.readFileSync(commonCyberiaPath, 'utf8').replace(
        `/*replace-display-instance*/`,
        `
DisplayComponent.get['${displayId}'] = () => ({ ...DisplayComponent.get['anon'](), displayId: '${displayId}' });
Stat.get['${displayId}'] = () => ({ ...Stat.get['anon'](), vel: 0.14 });

/*replace-display-instance*/
        `,
      ),
      'utf8',
    );

    break;
  }

  default:
    break;
}

await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
