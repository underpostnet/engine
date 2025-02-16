import { loadConf, repoClone } from './conf.js';

class Project {
  static clone(gitUri = 'underpostnet/pwa-microservices-template') {
    return repoClone(gitUri);
  }

  static useEnv(deployId = 'default', env = 'production') {
    return loadConf(deployId, env);
  }
}

export default Project;
