import { loadConf, newProject, repoClone, repoCommit, repoPull, repoPush } from './conf.js';

class Project {
  constructor(repositoryName, version) {
    return newProject(repositoryName, version);
  }

  static clone(gitUri = 'underpostnet/pwa-microservices-template') {
    return repoClone(gitUri);
  }

  static useEnv(deployId = 'default', env = 'production') {
    return loadConf(deployId, env);
  }

  static pull(repoPath = './', gitUri = 'underpostnet/pwa-microservices-template') {
    return repoPull(repoPath, gitUri);
  }

  static commit(
    repoPath = './',
    commitType = 'feat',
    subModule = '',
    message = '',
    options = {
      copy: false,
      info: false,
      empty: false,
    },
  ) {
    return repoCommit(repoPath, commitType, subModule, message, options);
  }

  static push(repoPath = './', gitUri = 'underpostnet/pwa-microservices-template') {
    return repoPush(repoPath, gitUri);
  }
}

export default Project;
