const DefaultWsMainManagement = {
  element: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
  },
};

export { DefaultWsMainManagement };
