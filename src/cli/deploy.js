class UnderpostDeploy {
  static API = {
    callback: (deployList = 'default', env = 'development') => {
      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
      }
    },
  };
}

export default UnderpostDeploy;
