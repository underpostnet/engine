#! /usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import Underpost from '../src/index.js';
import fs from 'fs-extra';
import { DataBaseProvider } from '../src/db/DataBaseProvider.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LoreCyberia } from '../src/client/components/cyberia/CommonCyberia.js';
import { loggerFactory } from '../src/server/logger.js';
import keyword_extractor from 'keyword-extractor';

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

await DataBaseProvider.load({
  apis: ['cyberia-tile', 'cyberia-biome', 'cyberia-instance', 'cyberia-world'],
  host,
  path,
  db,
});

/** @type {import('../src/api/cyberia-tile/cyberia-tile.model.js').CyberiaTileModel} */
const CyberiaTile = DataBaseProvider.instance[`${host}${path}`].mongoose.models.CyberiaTile;

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

const closeProgram = async () => {
  await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
  process.exit(0);
};

const program = new Command();

program.name('cyberia').description(`content generator cli ${Underpost.version}`).version(Underpost.version);

program
  .command('saga')
  .option('--keywords [key-words]')
  .action(async (options = { keywords: '' }) => {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${metanarrative}, ${
                options.keywords && typeof options.keywords === 'string'
                  ? `using these key concepts: ${options.keywords}, `
                  : ''
              }${sagaOptions}, and assign a dev storage id to the saga with this format saga-id:<insert-id-of-ref-title-saga>`,
            },
          ],
        },
      ],
      // generationConfig,
    });
    const response = result.response.text();

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
    const storagePath = `./src/client/public/cyberia/assets/ai-resources/lore/${sagaId}`;
    fs.mkdirSync(storagePath, { recursive: true });
    fs.writeFileSync(`${storagePath}/saga.md`, response, 'utf8');
    await closeProgram();
  })
  .description('Saga narrative generator');

program.parse();
