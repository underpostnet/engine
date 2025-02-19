import dotenv from 'dotenv';
import { shellExec } from '../server/process.js';

class UnderpostSecret {
  static API = {
    docker: {
      createFromEnvFile(envPath) {
        const envObj = dotenv.parse(envPath);
        for (const key of Object.keys(envObj)) {
          UnderpostSecret.set(key, envObj[key]);
        }
      },
      set(key, value) {
        shellExec(`docker secret rm ${key}`);
        shellExec(`echo "${value}" | docker secret create ${key} -`);
      },
    },
  };
}

export default UnderpostSecret;
