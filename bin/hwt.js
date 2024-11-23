import fs from 'fs-extra';
import axios from 'axios';
import https from 'https';

import dotenv from 'dotenv';
import { shellCd, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

axios.defaults.httpsAgent = httpsAgent;

logger.info('argv', process.argv);

const [exe, dir, operator, templateId, publicPath] = process.argv;

// engine for 'html-website-templates'

try {
  switch (operator) {
    case 'set-base':
      {
        switch (parseInt(templateId)) {
          // Horizontal Scroll One Page Template Website
          case 0:
            {
              fs.writeFile(
                `${publicPath}/index.html`,
                fs
                  .readFileSync(`${publicPath}/index.html`, 'utf8')
                  .replace(`<ul class="menu">`, `<ul class="menu hidden">`)
                  .replaceAll(`<section class="slide fade-6 kenBurns">`, `<section class="fade-6 kenBurns hidden">`)
                  .replace(`<section class="fade-6 kenBurns hidden">`, `<section class="slide fade-6 kenBurns">`)
                  .replaceAll(
                    `<nav class="panel bottom forceMobileView">`,
                    `<nav class="panel bottom forceMobileView hidden">`,
                  ),

                'utf8',
              );
            }
            break;

          default:
            break;
        }
      }
      break;

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
