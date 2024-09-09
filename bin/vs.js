import fs from 'fs';
import { shellExec } from '../src/server/process.js';

switch (process.argv[2]) {
  case 'install-extensions':
    {
      const extensions = JSON.parse(fs.readFileSync(`./.vscode/extensions.json`, 'utf8'));
      extensions.recommendations.map((extension) => {
        if (extension) shellExec(`code --install-extension ${extension}`);
      });
    }
    break;

  default:
    break;
}
