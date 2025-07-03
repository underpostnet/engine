import { shellExec } from '../server/process.js';

class UnderpostLxd {
  static API = {
    async callback(options = { init: false, reset: false, install: false }) {
      if (options.reset === true) {
        shellExec(`sudo systemctl stop snap.lxd.daemon`);
        shellExec(`sudo snap remove lxd --purge`);
      }
      if (options.install === true) shellExec(`sudo snap install lxd`);
      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
      }
    },
  };
}

export default UnderpostLxd;
