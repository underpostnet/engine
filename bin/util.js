import fs from 'fs-extra';
import merge from 'deepmerge';
import si from 'systeminformation';
import * as dir from 'path';
import { svg } from 'font-awesome-assets';
import axios from 'axios';
import https from 'https';

import { loggerFactory } from '../src/server/logger.js';
import { shellCd, shellExec } from '../src/server/process.js';
import { range, s4 } from '../src/client/components/core/CommonJs.js';
import { network } from '../src/server/network.js';
import { Config } from '../src/server/conf.js';
import { FileFactory } from '../src/api/file/file.service.js';
import { buildTextImg, faBase64Png, getBufferPngText } from '../src/server/client-icons.js';

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
    case 'cls':
      fs.removeSync('./public');
      fs.removeSync('./logs');
      fs.removeSync('./conf');
      //   fs.removeSync('./engine-private');
      //   fs.removeSync('./node_modules');
      break;
    case 'log':
      (() => {
        const logPath = `./logs/${process.argv[3]}/${process.argv[4]}.log`;
        logger.info('Read', logPath);
        console.log(fs.readFileSync(logPath, 'utf8'));
      })();
      break;
    case 'kill-ports':
      if (!process.argv[3]) process.argv[3] = '22,80,443,3000-3020';
      for (const port of process.argv[3].split(',')) {
        const rangePort = port.split('-');
        if (rangePort[1])
          for (const port of range(parseInt(rangePort[0]), parseInt(rangePort[1]))) {
            logger.info('clean port', port);
            await network.port.portClean(port);
          }
        else {
          logger.info('clean port', parseInt(port));
          await network.port.portClean(port);
        }
      }
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
    case 'export-git-changes':
      {
        const baseFrom = process.argv[3];
        const baseTo = process.argv[4];
        // if (fs.existsSync(baseTo)) fs.removeSync(baseTo);
        shellCd(baseFrom);
        {
          try {
            let output = shellExec('git status', { silent: true, stdout: true });
            console.log('output:', output);
            output = output
              .split(`to discard changes in working directory)`)[1]
              .split(`Untracked files:`)[0]
              .split('modified:')
              .map((c) => c.trim().replaceAll(`\n`, ''));
            output[output.length - 1] = output[output.length - 1].split('no changes added to commit')[0];
            output.shift();
            for (const fromPath of output) {
              const from = `${baseFrom}/${fromPath}`;
              const to = `${baseTo}/${fromPath}`;
              logger.info('Copy path', { from, to });
              fs.copySync(from, to);
            }
          } catch (error) {
            logger.error(error);
          }
        }
        {
          try {
            let output = shellExec('git status', { silent: true, stdout: true });
            console.log('output:', output);
            output = output
              .split(`to include in what will be committed)`)[1]
              .split(`no changes added to commit`)[0]
              .split(`\n`)
              .map((l) => l.trim())
              .filter((l) => l);

            for (const fromPath of output) {
              const from = `${baseFrom}/${fromPath}`;
              const to = `${baseTo}/${fromPath}`;
              logger.info('Copy path', { from, to });
              fs.copySync(from, to);
            }
          } catch (error) {
            logger.error(error);
          }
        }
      }
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

    case 'get-ip': {
      const response = await axios.get(process.argv[3]);
      logger.info(process.argv[3] + ' IP', response.request.socket.remoteAddress);
      break;
    }

    case 'clean-env': {
      shellExec(`git checkout package.json`);
      shellExec(`git checkout .env.production`);
      shellExec(`git checkout .env.development`);
      shellExec(`git checkout .env.test`);
      shellExec(`git checkout jsdoc.json`);
      break;
    }

    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
