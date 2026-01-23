import fs from 'fs-extra';
import * as dir from 'path';

import { loggerFactory } from '../src/server/logger.js';
import { pbcopy } from '../src/server/process.js';
import { buildKindPorts } from '../src/server/conf.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const operator = process.argv[2];

try {
  // let cmd;
  switch (operator) {
    case 'log':
      console.log(fs.readFileSync(process.argv[3], 'utf8'));
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

    case 'build-ports': {
      pbcopy(buildKindPorts(process.argv[3], process.argv[4]));
    }
    default:
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
