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
import { random, s4 } from '../src/client/components/core/CommonJs.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const deployId = process.env.DEFAULT_DEPLOY_ID;
const host = process.env.DEFAULT_DEPLOY_HOST;
const path = process.env.DEFAULT_DEPLOY_PATH;
const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));
const { db } = confServer[host][path];
const platformSuffix = process.platform === 'linux' ? '' : 'C:';
const commonCyberiaPath = `src/client/components/cyberia/CommonCyberia.js`;
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
  static async connect() {
    CyberiaDB.instance = await DataBaseProvider.load({
      apis: ['cyberia-tile', 'cyberia-biome', 'cyberia-instance', 'cyberia-world'],
      host,
      path,
      db,
    });

    CyberiaDB.CyberiaTile = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaTile;
  }
  static async close() {
    if (CyberiaDB.instance) await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  }
  /** @type {import('../src/api/cyberia-tile/cyberia-tile.model.js').CyberiaTileModel} */
  static CyberiaTile = null;
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
  .argument('[ques-id]', 'Quest id model reference')
  .action(async (sagaId, options = { questId: '' }) => {
    const idQuests = Object.keys(QuestComponent.Data).filter((e) => !['odisea-seller'].includes(e));
    const idQuestJsonExample =
      options.questId && typeof options.questId === 'string'
        ? options.questId
        : idQuests[random(0, idQuests.length - 1)];
    const questsPath = `${lorePath}/${sagaId}/quests`;
    if (!fs.existsSync(questsPath)) fs.mkdirSync(questsPath, { recursive: true });

    const questsAlreadyCreated = await fs.readdir(questsPath);

    const prompt = `${metanarrative}, and the current saga is about: ${fs.readFileSync(
      `${lorePath}/${sagaId}/saga.md`,
      'utf8',
    )}, Generate a new ${
      questsAlreadyCreated.length > 0 ? 'first ' : ''
    }quest saga json example instance, following this JSON format example:
    ${JSON.stringify(
      {
        ...QuestComponent.Data[idQuestJsonExample](),
        defaultDialog: {
          en: '<insert-default-dialog-here>',
          es: '<insertar-default-dialogo-aqui>',
        },
        questId: '<insert-new-sub-quest-id>',
      },
      null,
      4,
    )}. The 'assetFolder' value attribute options available for the elements of 'displaySearchObjects' array are the following: ${Object.keys(
      CyberiaItemsType,
    )} ${
      questsAlreadyCreated.length > 0
        ? `keep in mind that quest already created: ${questsAlreadyCreated
            .filter((s) => s.match('.json'))
            .map((s) => {
              const _q = JSON.parse(fs.readFileSync(`${questsPath}/${s}`, 'utf8'));
              return `${s} quest: ${s} description: ${_q.description.en} ${s} successDescription: ${_q.successDescription.en}`;
            })
            .join(', ')}, so create a new quest id on JSON`
        : ''
    }.`;

    console.log('prompt:', prompt);

    let response = await generateContent(prompt);

    console.log('response:', response);

    console.log(response);

    response = response.split('```');

    const md = response.pop();

    const json = JSON.parse(
      response
        .join('```')
        .replace(/```json/g, '')
        .replace(/```/g, ''),
    );

    logger.info('metadata', { questId: json.questId });

    fs.writeFileSync(`${questsPath}/${json.questId}.json`, JSON.stringify(json, null, 4), 'utf8');
    fs.writeFileSync(`${questsPath}/${json.questId}.md`, md, 'utf8');
  })
  .description('Quest json data gameplay data generator');

program
  .command('media')
  .argument('<saga-id>')
  .argument('[quest-id]')
  .action(async (sagaId, questId) => {
    const quests = await fs.readdir(`./src/client/public/cyberia/assets/ai-resources/lore/${sagaId}/quests`);
    for (const quest of quests) {
      if (!quest.match('.json') || (questId && !quest.match(questId))) continue;
      const questPath = `./src/client/public/cyberia/assets/ai-resources/lore/${sagaId}/quests/${quest}`;
      console.log('read', questPath);
      const questData = JSON.parse(fs.readFileSync(questPath, 'utf8'));

      for (const searchObject of questData.displaySearchObjects) {
        const { id } = searchObject;
        console.log('gen media', searchObject);
      }
    }
  })
  .description('Media generator related quest id');

program.parse();
