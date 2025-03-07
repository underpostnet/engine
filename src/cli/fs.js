class UnderpostFileStorage {
  static API = {
    async callback(deployList, path) {
      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;
        console.log({ deployId });
      }
    },
  };
}

export default UnderpostFileStorage;
