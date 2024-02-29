const CoreWsMailerManagement = {
  element: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
  },
  getUserWsId: function (wsManagementId = '', id = '') {
    for (const userWsId of Object.keys(this.element[wsManagementId])) {
      if (this.element[wsManagementId][userWsId].model.user._id === id) {
        return userWsId;
      }
    }
    return undefined;
  },
};

export { CoreWsMailerManagement };
