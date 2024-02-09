const CyberiaWsUserManagement = {
  element: {},
  localElementScope: {},
  instance: function (wsManagementId = '') {
    this.element[wsManagementId] = {};
    this.localElementScope[wsManagementId] = {};
  },
};

export { CyberiaWsUserManagement };
