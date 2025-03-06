import { getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import UnderpostDeploy from './deploy.js';

const logger = loggerFactory(import.meta);

class UnderpostScript {
  static API = {
    set(key, value) {
      const npmRoot = `${getNpmRootPath()}/underpost`;
      const packageJson = JSON.parse(fs.readFileSync(`${npmRoot}/package.json`, 'utf8'));
      packageJson.scripts[key] = value;
      fs.writeFileSync(`${npmRoot}/package.json`, JSON.stringify(packageJson, null, 4));
    },
    run(key, value, options) {
      const npmRoot = `${getNpmRootPath()}/underpost`;
      const packageJson = JSON.parse(fs.readFileSync(`${npmRoot}/package.json`, 'utf8'));
      if (options.itc === true) {
        value = packageJson.scripts[key];
        const podScriptPath = `${options.itcPath && typeof options.itcPath === 'string' ? options.itcPath : '/'}${value
          .split('/')
          .pop()}`;
        const nameSpace = options.ns && typeof options.ns === 'string' ? options.ns : 'default';
        const podMatch = options.podName && typeof options.podName === 'string' ? options.podName : key;

        if (fs.existsSync(`${value}`)) {
          for (const pod of UnderpostDeploy.API.get(podMatch)) {
            shellExec(`sudo kubectl cp ${value} ${nameSpace}/${pod.NAME}:${podScriptPath}`);
            const cmd = `node ${podScriptPath}`;
            shellExec(`sudo kubectl exec -i ${pod.NAME} -- sh -c "${cmd}"`);
          }
        } else {
          for (const pod of UnderpostDeploy.API.get(podMatch)) {
            shellExec(`sudo kubectl exec -i ${pod.NAME} -- sh -c "${value}"`);
          }
        }

        return;
      }
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
