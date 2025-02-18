import fs from 'fs-extra';
import si from 'systeminformation';
import * as dir from 'path';
import { svg } from 'font-awesome-assets';
import axios from 'axios';
import https from 'https';

import { loggerFactory } from '../src/server/logger.js';
import { pbcopy, shellExec } from '../src/server/process.js';
import { buildKindPorts } from '../src/server/conf.js';
import { FileFactory } from '../src/api/file/file.service.js';
import { faBase64Png, getBufferPngText } from '../src/server/client-icons.js';
import keyword_extractor from 'keyword-extractor';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
axios.defaults.httpsAgent = httpsAgent;

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const operator = process.argv[2];

try {
  // let cmd;
  switch (operator) {
    case 'log':
      console.log(fs.readFileSync(process.argv[3], 'utf8'));
      break;

    case 'system-info':
      await (async () => {
        for (const infoKey of Object.keys(si)) {
          if (typeof si[infoKey] === 'function') {
            //  'dockerInfo', 'vboxInfo'
            if (!['osInfo', 'graphics', 'cpu'].includes(infoKey)) continue;
            try {
              const infoInstance = await si[infoKey]();
              logger.info(infoKey, infoInstance);
            } catch (error) {
              logger.info('Not valid info function', infoKey);
            }
          }
        }
      })();
      break;
    case 'delete-empty-folder':
      function cleanEmptyFoldersRecursively(folder) {
        if (!fs.existsSync(folder)) {
          logger.warn('Does not exist', folder);
          return;
        }
        const isDir = fs.statSync(folder).isDirectory();
        if (!isDir) return;

        let files = fs.readdirSync(folder);
        if (files.length > 0) {
          files.forEach(function (file) {
            const fullPath = dir.join(folder, file);
            cleanEmptyFoldersRecursively(fullPath);
          });

          // re-evaluate files; after deleting subfolder
          // we may have parent folder empty now
          files = fs.readdirSync(folder);
        }

        if (files.length === 0) {
          console.log('removing: ', folder);
          try {
            fs.rmdirSync(folder);
          } catch (error) {
            logger.error(error);
          }
          return;
        }
      }
      cleanEmptyFoldersRecursively('./');
      break;

    case 'text-to-image': {
      const buffer = await getBufferPngText({
        text: process.argv[3],
        textColor: process.argv[4],
        bgColor: process.argv[5],
        size: process.argv[6],
        debugFilename: process.argv[7],
      });
      fs.writeFileSync(`./text-to-image.png`, buffer);
      break;
    }
    case 'fa-image':
      const faId = process.argv[3] ? process.argv[3] : 'user';
      const color = process.argv[4] ? process.argv[4] : '#5f5f5f';
      const path = process.argv[5] ? process.argv[5] : './';

      {
        fs.writeFileSync(`./tmp/${faId}.svg`, svg(faId, color), 'utf8');
        const data = fs.readFileSync(`./tmp/${faId}.svg`);
        console.log(FileFactory.svg(data, `${faId}.svg`));
        fs.removeSync(`${path}${faId}.svg`);
      }
      {
        fs.writeFileSync(`${path}${faId}.png`, Buffer.from(faBase64Png(faId, 100, 100, color), 'base64'));
      }

      break;

    case 'b64-image':
      fs.writeFileSync('b64-image', `data:image/jpg;base64,${fs.readFileSync(process.argv[3]).toString('base64')}`);
      break;

    case 'clean-env': {
      shellExec(`git checkout package.json`);
      shellExec(`git checkout .env.production`);
      shellExec(`git checkout .env.development`);
      shellExec(`git checkout .env.test`);
      shellExec(`git checkout jsdoc.json`);
      break;
    }
    case 'get-keys': {
      const sentence = fs.existsSync('./_')
        ? fs.readFileSync('./_', 'utf8')
        : process.argv[3]
        ? process.argv[3]
        : 'President Obama woke up Monday facing a Congressional defeat that many in both parties believed could hobble his presidency.';

      //  Extract the keywords
      const extraction_result = keyword_extractor.extract(sentence, {
        language: 'english',
        remove_digits: true,
        // return_changed_case: true,
        // remove_duplicates: false,
      });

      console.log(extraction_result.join(', '));
      break;
    }

    case 'build-ports': {
      pbcopy(buildKindPorts(process.argv[3], process.argv[4]));
    }
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
