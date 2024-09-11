import fs from 'fs-extra';
import { shellExec } from '../src/server/process.js';

switch (process.argv[2]) {
  case 'import':
    {
      const extensions = JSON.parse(fs.readFileSync(`./.vscode/extensions.json`, 'utf8'));
      extensions.recommendations.map((extension) => {
        if (extension) shellExec(`code --install-extension ${extension}`);
      });
    }
    break;
  case 'export':
    {
      shellExec(`code --list-extensions > vs-extensions.txt`);
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
