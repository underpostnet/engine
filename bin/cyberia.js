#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost from '../src/index.js';
import fs from 'fs-extra';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CyberiaItemsType, LoreCyberia, QuestComponent } from '../src/client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../src/server/logger.js';
import keyword_extractor from 'keyword-extractor';
import { random, range, s4, uniqueArray } from '../src/client/components/core/CommonJs.js';
import { pbcopy, shellExec } from '../src/server/process.js';
import read from 'read';
import { setTransparency } from '../src/api/cyberia-tile/cyberia-tile.service.js';
import Jimp from 'jimp';

dotenv.config();

const logger = loggerFactory(import.meta);

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;
const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];
const lorePath = `./src/client/public/cyberia/assets/ai-resources/lore`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = 'gemini-2.0-pro-exp-02-05';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

const metanarrative = `For a roguelike mmorpg with this metanarrative lore: '${JSON.stringify(LoreCyberia, null, 4)
  .replaceAll('{', '')
  .replaceAll('}', '')
  .replaceAll('"', '')}.'`;

const sagaOptions = `
  Generate description of new saga saga, with characters names, personalities, with their aesthetics and context regarding the metanarrative,
  and add choose central conflict: Family, Friendships, Social, Political, Personal,
  and add choose narrative structure: Linear, Non-linear, Circular, Episodic,
  and add choose tone: Tragedy, Comedy, Drama, Satire.`;

const generationConfig = {
  temperature: 0.9,
  topK: 32,
  topP: 0.95,
  maxOutputTokens: 1024,
};

class CyberiaDB {
  static instance = null;
  static async connect(apis) {
    CyberiaDB.instance = await DataBaseProvider.load({
      apis: apis ?? ['cyberia-tile', 'cyberia-biome', 'cyberia-instance', 'cyberia-world'],
      host,
      path,
      db,
    });

    CyberiaDB.CyberiaTile = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaTile;
    CyberiaDB.File = DataBaseProvider.instance[`${host}${path}`].mongoose.models.File;
  }
  static async close() {
    if (CyberiaDB.instance) await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  }
  /** @type {import('../src/api/cyberia-tile/cyberia-tile.model.js').CyberiaTileModel} */
  static CyberiaTile = null;
  /** @type {import('../src/api/file/file.model.js').FileModel} */
  static File = null;
}
const closeProgram = async () => {
  await CyberiaDB.close();
  process.exit(0);
};

const generateContent = async (prompt) => {
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    // generationConfig,
  });
  return result.response.text();
};

const buildAsset = async (sagaId, mediaObject, options = { flip: false }) => {
  const frameColor = 'rgba(255, 255, 255)';
  const commonCyberiaPath = `src/client/components/cyberia/CommonCyberia.js`;
  let { id, itemType } = mediaObject;
  const displayId = id;
  const basePath = `${lorePath}/${sagaId}/media/${displayId}`;
  if (itemType === 'questItem') itemType = 'quest';
  const buildFrame = async (pos) => {
    return await new Promise((resolve) => {
      Jimp.read(`${basePath}/0${pos}.png`).then(async (image) => {
        const dim = image.bitmap.width > image.bitmap.height ? image.bitmap.width : image.bitmap.height;
        if (!fs.existsSync(`./src/client/public/cyberia/assets/${itemType}/${displayId}/0${pos}`))
          fs.mkdirSync(`./src/client/public/cyberia/assets/${itemType}/${displayId}/0${pos}`, { recursive: true });

        const frame = new Jimp(dim + dim * 0.25, dim + dim * 0.25, frameColor);

        frame.composite(
          image,
          (frame.bitmap.width - image.bitmap.width) / 2,
          (frame.bitmap.height - image.bitmap.height) / 2,
        );

        frame.resize(500, 500);

        if (`${options.flip}` === `${pos}`) frame.flip(true, false);

        const outPath = `/home/dd/engine/src/client/public/cyberia/assets/${itemType}/${displayId}/0${pos}/0.png`;

        await setTransparency(frame);

        frame.write(outPath);

        if (options.preview === `${pos}` || (!options.preview && '8' === `${pos}`))
          frame.write(`/home/dd/engine/src/client/public/cyberia/assets/${itemType}/${displayId}/animation.gif`);

        if (!fs.existsSync(`./src/client/public/cyberia/assets/${itemType}/${displayId}/1${pos}`))
          fs.mkdirSync(`./src/client/public/cyberia/assets/${itemType}/${displayId}/1${pos}`, { recursive: true });

        for (const _pos of range(0, 1)) {
          const frame = new Jimp(dim + dim * 0.25, dim + dim * 0.25, frameColor);

          frame.composite(
            image,
            (frame.bitmap.width - image.bitmap.width) / 2,
            (frame.bitmap.height - image.bitmap.height) / (_pos === 0 ? 2.3 : 1.7),
          );

          frame.resize(500, 500);

          if (`${options.flip}` === `${pos}`) frame.flip(true, false);

          const outPath = `/home/dd/engine/src/client/public/cyberia/assets/${itemType}/${displayId}/1${pos}/${_pos}.png`;

          await setTransparency(frame);

          frame.write(outPath);
        }

        return resolve();
      });
    });
  };
  for (const position of [2, 8, 6, 4]) await buildFrame(position);
  return;

  fs.writeFileSync(
    commonCyberiaPath,
    fs.readFileSync(commonCyberiaPath, 'utf8').replace(
      `/*replace-display-instance*/`,
      `DisplayComponent.get['${displayId}'] = () => ({ ...DisplayComponent.get['anon'](), displayId: '${displayId}' });
Stat.get['${displayId}'] = () => ({ ...Stat.get['anon'](), vel: 0.14 });

/*replace-display-instance*/`,
    ),
    'utf8',
  );
};

const program = new Command();

program.name('cyberia').description(`content generator cli ${Underpost.version}`).version(Underpost.version);

program
  .command('saga')
  .option('--keywords [key-words]')
  .action(async (options = { keywords: '' }) => {
    const prompt = `${metanarrative}, ${
      options.keywords && typeof options.keywords === 'string' ? `using these key concepts: ${options.keywords}, ` : ''
    }${sagaOptions}, and assign a dev storage id to the saga with this format saga-id:<insert-id-of-ref-title-saga>`;

    const response = await generateContent(prompt);

    const sagaId = keyword_extractor
      .extract(`${response.split(' ').find((r) => r.match('saga-id:'))}`, {
        language: 'english',
        remove_digits: true,
        // return_changed_case: true,
        // remove_duplicates: false,
      })
      .join('-')
      .replaceAll('`', '')
      .replaceAll('**Central', '')
      .replaceAll('*', '');

    logger.info('metadata', {
      sagaId,
    });
    const storagePath = `${lorePath}/${sagaId}`;
    fs.mkdirSync(storagePath, { recursive: true });
    fs.writeFileSync(`${storagePath}/saga.md`, response, 'utf8');
    await closeProgram();
  })
  .description('Saga narrative generator');

program
  .command('quest')
  .argument('<saga-id>', 'Id of saga related')
  .action(async (sagaId) => {
    const questsPath = `${lorePath}/${sagaId}/quests`;
    if (!fs.existsSync(questsPath)) fs.mkdirSync(questsPath, { recursive: true });

    const originQuestsAlreadyCreated = await fs.readdir(questsPath);
    const questsAlreadyCreated =
      originQuestsAlreadyCreated.length > 3 ? originQuestsAlreadyCreated.slice(-3) : originQuestsAlreadyCreated; // last 3 chapters context

    const prompt = `${metanarrative}, and the current saga is about: ${fs.readFileSync(
      `${lorePath}/${sagaId}/saga.md`,
      'utf8',
    )}, Generate a new ${
      questsAlreadyCreated.length === 0 ? 'first ' : ''
    }quest saga json example instance, following this JSON format example:
    ${fs.readFileSync(
      `./src/client/public/cyberia/assets/ai-resources/lore/ashes-of-orion/quests/ashes-of-orion-1.json`,
      'utf8',
    )}. Select appropriate  questKeyContext (provide, displaySearchObjects, displayKillObjects, displaySearchDialog, or seller) of components elements. The 'itemType' value attribute of the 'displaySearchObjects' and 'provide.displayIds' elements can only be: ${Object.keys(
      CyberiaItemsType,
    )} chose appropriate. ${
      questsAlreadyCreated.length > 0
        ? `Keep in mind that quest already created: ${questsAlreadyCreated
            .filter((s) => s.match('.json'))
            .map((s) => {
              const _q = JSON.parse(fs.readFileSync(`${questsPath}/${s}`, 'utf8'));
              return `${s} quest: ${s} description: ${_q.description.en} ${s} successDescription: ${_q.successDescription.en}`;
            })
            .join(', ')}.`
        : ''
    } , all image resource paths following this format 'assets/<item-type>/<item-id>/<side-number>/<frame-number>.png' with side number chose: '08' front side, '02' back side, '04' left side, and '06' 
    right side, e. g. 'assets/skin/aiko-ishikawa/08/0.png'. It must have narrative consistency with the previous chapters. Add review of chapter after json`;

    console.log('prompt:', prompt);

    let response = await generateContent(prompt);

    console.log('response:', response);

    response = response.split('```');

    const md = response.pop();

    const json = JSON.parse(
      response
        .join('```')
        .replace(/```json/g, '')
        .replace(/```/g, ''),
    );

    fs.writeFileSync(
      `${questsPath}/${sagaId}-${originQuestsAlreadyCreated.length + 1}.json`,
      JSON.stringify(json, null, 4),
      'utf8',
    );
  })
  .description('Quest gameplay json  data generator');

program
  .command('file')
  .argument('<saga-id>')
  .argument('<item-id>')
  .argument('<file-id>')
  .action(async (sagaId, itemId, fileId) => {
    await CyberiaDB.connect(['file']);

    const file = await CyberiaDB.File.findById(fileId);

    const destFolder = `./src/client/public/cyberia/assets/ai-resources/lore/${sagaId}/media/${itemId}`;

    logger.info('metadata', { destFolder, name: file._doc.name });

    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

    fs.writeFileSync(`${destFolder}/${itemId}.png`, Buffer.from(file.data, 'base64'));

    await closeProgram();
  })
  .description('File management');

program
  .command('media')
  .argument('[saga-id]')
  .argument('[quest-id]')
  .option('--build-global-assets-index')
  .option('--prompt')
  .option('--build')
  .option('--flip <flip-position>')
  .option('--preview <preview-position>')
  .option('--id <media-id>')
  .option('--import')
  .action(
    async (
      sagaId,
      questId,
      options = { prompt: false, import: false, id: '', flip: '', preview: '', buildGlobalAssetsIndex: false },
    ) => {
      if (options.buildGlobalAssetsIndex === true) {
        const indexStorage = './engine-private/conf/dd-cyberia/global-assets-index.json';

        const globalAssetsIndex = {};

        for (const sagaId of await fs.readdir(lorePath))
          if (fs.existsSync(`${lorePath}/${sagaId}/quests`))
            for (const questId of await fs.readdir(`${lorePath}/${sagaId}/quests`)) {
              const dataQuest = JSON.parse(fs.readFileSync(`${lorePath}/${sagaId}/quests/${questId}`, 'utf8'));
              if (dataQuest.id) {
                for (const component of dataQuest.components) {
                  const { id, apiPaths } = component;
                  if (apiPaths) globalAssetsIndex[id] = { apiPaths, sagaId, questId };
                }
              }
            }

        fs.writeFileSync(indexStorage, JSON.stringify(globalAssetsIndex, null, 4), 'utf8');
        return;
      }

      if (options.import === true) {
        const mediaObject = JSON.parse(fs.readFileSync(`${lorePath}/${sagaId}/media.json`, 'utf8')).find(
          (i) => i.id === options.id,
        );
        logger.info('mediaObject', mediaObject);
        await buildAsset(sagaId, mediaObject, options);
        return;
      }

      if (options.build === true) {
        // https://github.com/nadermx/backgroundremover
        // other option: ../lab/src/python pil-rembg.py
        // other option: rembg i

        const bgCmd = 'python -m backgroundremover.cmd.cli';

        const mediaObjects =
          options.id && typeof options.id === 'string'
            ? [
                {
                  id: options.id,
                },
              ]
            : JSON.parse(fs.readFileSync(`${lorePath}/${sagaId}/media.json`, 'utf8'));

        for (const media of mediaObjects) {
          const { id } = media;
          const imgExtension = fs.existsSync(`${lorePath}/${sagaId}/media/${id}/${id}.png`) ? 'png' : 'jpeg';
          if (fs.existsSync(`${lorePath}/${sagaId}/media/${id}`)) {
            shellExec(
              `${bgCmd}` +
                ` -i ${lorePath}/${sagaId}/media/${id}/${id}.${imgExtension}` +
                ` -o ${lorePath}/${sagaId}/media/${id}/${id}-alpha.${imgExtension}`,
            );
            shellExec(
              `python ../lab/src/cv2-sprite-sheet-0.py` +
                ` ${process.cwd()}/src/client/public/cyberia/assets/ai-resources/lore/${sagaId}/media/${id}/${id}-alpha.${imgExtension}` +
                ` ${process.cwd()}/src/client/public/cyberia/assets/ai-resources/lore/${sagaId}/media/${id}/${id}`,
            );
          }
        }
        return;
      }

      if (options.prompt === true) {
        const mediaObjects = JSON.parse(fs.readFileSync(`${lorePath}/${sagaId}/media.json`, 'utf8'));

        for (const media of mediaObjects) {
          const { itemType, id, aestheticKeywords } = media;
          if (options.id && typeof options.id === 'string' && options.id !== id) continue;
          // use https://deepai.org/machine-learning-model/text2img
          switch (itemType) {
            case 'skin':
              pbcopy(
                `generate 1 side profile sprite and 1 back sprite and 1 front sprite, of ${id}, ${aestheticKeywords}, Chibi, Cartoon, pixel art, 8bit `,
              );
              await read({ prompt: `Prompt '${id}' copy to clipboard, press enter to continue.\n` });

              break;

            default:
              pbcopy(
                `generate spreed sheet, of '${id}', view from above and from the side, ${aestheticKeywords}, rpg item, pixel art, 8bit`,
              );
              await read({ prompt: `Prompt '${id}' copy to clipboard, press enter to continue.\n` });

              break;
          }
        }

        return;
      }

      // Gen data media

      const quests = await fs.readdir(`${lorePath}/${sagaId}/quests`);
      let idItems = {};

      for (const quest of quests) {
        if (questId && !quest.match(questId)) continue;
        const questPath = `${lorePath}/${sagaId}/quests/${quest}`;
        console.log('read', questPath);
        const questData = JSON.parse(fs.readFileSync(questPath, 'utf8'));

        for (const searchObject of questData.components) {
          const { id, itemType, questKeyContext } = searchObject;
          idItems[id] = { itemType, questKeyContext };
        }

        for (const rewardObject of questData.reward) {
          const { id, type } = rewardObject;
          if (['coin'].includes(type)) continue;
          idItems[id] = { itemType: type, questKeyContext: 'reward' };
        }
      }
      let keysItem = Object.keys(idItems);

      if (options.id && typeof options.id === 'string') keysItem = keysItem.filter((id) => id === options.id);

      const tags = {
        provide: ['npc', 'cyberpunk'],
        displayKillObjects: ['cyberpunk', 'creature', 'enemy'],
        displaySearchObjects: ['cyberpunk', 'item'],
        displaySearchDialog: ['npc', 'cyberpunk'],
        seller: ['cyberpunk', 'seller', 'shop'],
        reward: ['cyberpunk', 'item'],
      };

      idItems = keysItem.map((id) => {
        return {
          id,
          aestheticKeywords: [],
          itemType: idItems[id].itemType,
          tags: tags[idItems[id].questKeyContext],
        };
      });

      const prompt = `According to this context '${fs.readFileSync(
        `${lorePath}/${sagaId}/saga.md`,
        'utf8',
      )}' and aesthetic description of some characters, complete 'aestheticKeywords' of this json: ${JSON.stringify(
        idItems,
        null,
        4,
      )}, if case doesn't exist created according 'tags' and add generic according context`;

      console.log('prompt:', prompt);

      let response = await generateContent(prompt);

      console.log('response:', response);

      response = response.split('```');

      const md = response.pop();

      const json = JSON.parse(
        response
          .join('```')
          .replace(/```json/g, '')
          .replace(/```/g, ''),
      );

      if (options.id && typeof options.id === 'string') {
        fs.writeFileSync(
          `${lorePath}/${sagaId}/media.json`,
          JSON.stringify(JSON.parse(fs.readFileSync(`${lorePath}/${sagaId}/media.json`, 'utf8')).concat(json), null, 4),
          'utf8',
        );
      } else fs.writeFileSync(`${lorePath}/${sagaId}/media.json`, JSON.stringify(json, null, 4), 'utf8');
    },
  )
  .description('Media generator related quest id');

program
  .command('universe')
  .argument('<universe-name>', 'Universe name')
  .option('--import')
  .option('--export')
  .action((...args) => {
    const universeId = args[0];
    const collections = ['cyberiabiomes', 'cyberiaworlds', 'cyberiainstances'];
    const outputPath = `./engine-private/cyberia-universes/${universeId}`;
    const deployId = 'dd-cyberia';
    if (args[1].export === true) {
      if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });
      if (!fs.existsSync(outputPath + '-files')) fs.mkdirSync(outputPath + '-files', { recursive: true });
      for (const collection of collections)
        shellExec(`node bin db --export --collection ${collection} --out-path ${outputPath} ${deployId}`);
      shellExec(`node bin db --export --collection ${'files'} --out-path ${outputPath}-files ${deployId}`);
    } else if (args[1].import === true) {
      if (!fs.existsSync(outputPath)) {
        logger.error('Could not find output path', outputPath);
      } else {
        shellExec(`node bin db --import --drop --preserveUUID --out-path ${outputPath}/${db.name} ${deployId}`);
        shellExec(`node bin db --import --out-path ${outputPath}-files/${db.name} ${deployId}`);
      }
    }
  })
  .description('Universer management');

program.parse();
