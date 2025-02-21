import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';

class UnderpostSecret {
  static API = {
    docker: {
      init() {
        shellExec(`docker swarm init`);
      },
      createFromEnvFile(envPath) {
        const envObj = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const key of Object.keys(envObj)) {
          UnderpostSecret.API.docker.set(key, envObj[key]);
        }
      },
      set(key, value) {
        shellExec(`docker secret rm ${key}`);
        shellExec(`echo "${value}" | docker secret create ${key} -`);
      },
      list() {
        shellExec(`docker secret ls`);
      },
    },
  };
}

export default UnderpostSecret;
