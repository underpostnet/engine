import fs from 'fs-extra';
import { shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

switch (process.argv[2]) {
  case 'info': {
    logger.info('Formatted', 'Ctrl shift I');
    logger.info('Command', 'Ctrl shift P');
    logger.info('Search', 'Ctrl shift F');
    logger.info('Debug', 'Ctrl shift D');
    logger.warn('Terminal shortcut configure with command pallette', 'Ctl shift T');

    break;
  }
  case 'import':
    {
      const extensions = JSON.parse(fs.readFileSync(`./.vscode/extensions.json`, 'utf8'));
      extensions.recommendations.map((extension) => {
        if (extension)
          shellExec(`sudo code --user-data-dir="/root/.vscode-root" --no-sandbox --install-extension ${extension}`);
      });
    }
    break;
  case 'export':
    {
      shellExec(`sudo code --user-data-dir="/root/.vscode-root" --no-sandbox --list-extensions > vs-extensions.txt`);
      fs.writeFileSync(
        `./.vscode/extensions.json`,
        JSON.stringify(
          {
            recommendations: fs
              .readFileSync(`./vs-extensions.txt`, 'utf8')
              .split(`\n`)
              .filter((ext) => ext.trim()),
          },
          null,
          4,
        ),
        'utf8',
      );
      fs.removeSync(`./vs-extensions.txt`);
    }
    break;
  default:
    break;
}
