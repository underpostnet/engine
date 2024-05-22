const DefaultWsDefaultManagement = {
  element: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
  },
};

export { DefaultWsDefaultManagement };
