import fs from 'fs';

const Xampp = {
  router: '',
  ports: [],
  enabled: () => false, // fs.existsSync(`C:/xampp/apache/conf/httpd.conf`),
  appendRouter: function (render) {
    this.router += render;
    return this.router;
  },
};

export { Xampp };
