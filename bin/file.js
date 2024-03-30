import fs from 'fs-extra';

import { loggerFactory } from '../src/server/logger.js';
import { cap, getDirname } from '../src/client/components/core/CommonJs.js';
import { shellExec } from '../src/server/process.js';
import walk from 'ignore-walk';

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

// usage:
// node bin/file create './wena que-onda.py'
// node bin/file create js-module './wena que-onda.js'
// node bin/file copy-src 'c:/dd/excel-api' 'c:/dd/engine/engine-private/deploy/excel-api'

let [exe, dir, type] = process.argv;
let rawPath = process.argv[3].replaceAll(`'`, '');
let toPath = process.argv[4].replaceAll(`'`, '');

let path = `${rawPath}`.split('/');
path.pop();
path = path.join('/');

const file = `${rawPath}`.split('/').pop();
const ext = file.split('.')[1];
let name = cap(file.split('.')[0].replaceAll('-', ' ')).replaceAll(' ', '');

logger.info('File metadata', { path, file, ext, name });

try {
  // throw '';
  // let cmd;
  let content = '';
  switch (type) {
    case 'create-js-module':
      // node bin/file './src/client/components/core/progress bar.js'
      content = `const ${name} = {}; export { ${name} }`;
      setTimeout(() => shellExec(`prettier --write ${buildPath}`));
      break;
    case 'copy-src':
      console.log({ rawPath, toPath });

      // this function returns a promise, but you can also pass a cb
      // if you like that approach better.
      let result = await new Promise((resolve) =>
        walk(
          {
            path: rawPath, // root dir to start in. defaults to process.cwd()
            ignoreFiles: [`.gitignore`], // list of filenames. defaults to ['.ignore']
            includeEmpty: false, // true to include empty dirs, default false
            follow: false, // true to follow symlink dirs, default false
          },
          (...args) => resolve(args[1]),
        ),
      );

      result = result.filter((path) => !path.startsWith('.git'));

      console.log('copy paths', result);

      fs.removeSync(toPath);

      for (const copyPath of result) {
        const folder = getDirname(`${toPath}/${copyPath}`);
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        fs.copyFileSync(`${rawPath}/${copyPath}`, `${toPath}/${copyPath}`);
      }

      break;
    case 'create':
      const buildPath = `${path}/${name}${ext ? `.${ext}` : ''}`;
      logger.info('Build path', buildPath);
      fs.mkdirSync(path, { recursive: true });
      fs.writeFileSync(buildPath, content, 'utf8');
    default:
      logger.error('not found operator');
      break;
  }
} catch (error) {
  logger.error(error, error.stack);
}
