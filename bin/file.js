import fs from 'fs-extra';

import { loggerFactory } from '../src/server/logger.js';
import { cap } from '../src/client/components/core/CommonJs.js';
import { shellExec } from '../src/server/process.js';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

let [exe, dir, rawPath] = process.argv;

rawPath = rawPath.replaceAll(`'`, '');

let path = `${rawPath}`.split('/');
path.pop();
path = path.join('/');

const file = `${rawPath}`.split('/').pop();
const ext = file.split('.').pop();
let name = file.split('.')[0];

logger.info('File metadata', { path, file, ext, name });

try {
  // throw '';
  // let cmd;
  let content = '';
  switch (ext) {
    case 'js':
      // node bin/file './src/client/components/core/progress bar.js'
      name = cap(name).replaceAll(' ', '');
      content = `const ${name} = {}; export { ${name} }`;
      setTimeout(() => shellExec(`prettier --write ${buildPath}`));
      break;

    default:
      break;
  }
  const buildPath = `${path}/${name}${ext ? `.${ext}` : ''}`;
  logger.info('Build path', buildPath);
  fs.mkdirSync(path, { recursive: true });
  fs.writeFileSync(buildPath, content, 'utf8');
} catch (error) {
  logger.error(error, error.stack);
}
