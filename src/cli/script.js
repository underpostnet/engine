import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

class UnderpostScript {
  static API = {
    set(key, value) {
      const npmRoot = `${getNpmRootPath()}/underpost`;
      const packageJson = JSON.parse(fs.readFileSync(`${npmRoot}/package.json`, 'utf8'));
      packageJson.scripts[key] = value;
      fs.writeFileSync(`${npmRoot}/package.json`, JSON.stringify(packageJson, null, 4));
    },
    run(key) {
      const npmRoot = `${getNpmRootPath()}/underpost`;
      shellExec(`cd ${npmRoot} && npm run ${key}`);
    },
    get(key) {
      const npmRoot = `${getNpmRootPath()}/underpost`;
      const packageJson = JSON.parse(fs.readFileSync(`${npmRoot}/package.json`, 'utf8'));
      logger.info('[get] ' + key, packageJson.scripts[key]);
      return packageJson.scripts[key];
    },
  };
}

export default UnderpostScript;
