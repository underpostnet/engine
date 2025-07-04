import { getNpmRootPath } from '../server/conf.js';
import { pbcopy, shellExec } from '../server/process.js';

class UnderpostLxd {
  static API = {
    async callback(
      options = {
        init: false,
        reset: false,
        dev: false,
        install: false,
        createVirtualNetwork: false,
        initVm: false,
        createVm: '',
      },
    ) {
      const npmRoot = getNpmRootPath();
      const underpostRoot = options?.dev === true ? '.' : `${npmRoot}/underpost`;
      if (options.reset === true) {
        shellExec(`sudo systemctl stop snap.lxd.daemon`);
        shellExec(`sudo snap remove lxd --purge`);
      }
      if (options.install === true) shellExec(`sudo snap install lxd`);
      if (options.init === true) {
        shellExec(`sudo systemctl start snap.lxd.daemon`);
        shellExec(`sudo systemctl status snap.lxd.daemon`);
        shellExec(`lxd init --preseed < ${underpostRoot}/manifests/lxd/lxd-preseed.yaml`);
        shellExec(`lxc cluster list`);
      }
      if (options.createVirtualNetwork === true) {
        shellExec(`lxc network create lxdbr0 \
ipv4.address=10.250.250.1/24 \
ipv4.nat=true \
ipv4.dhcp=true \
ipv6.address=none`);
      }
      if (options.createAdminProfile === true) {
        pbcopy(`lxc profile create admin-profile`);
        shellExec(`cat ${underpostRoot}/manifests/lxd/lxd-admin-profile.yaml | lxc profile edit admin-profile`);
        shellExec(`lxc profile show admin-profile`);
      }
      if (options.createVm && typeof options.createVm === 'string') {
        pbcopy(
          `lxc launch images:rockylinux/9 ${options.createVm} --vm --target lxd-node1 -c limits.cpu=2 -c limits.memory=4GB --profile admin-profile`,
        );
      }
      if (options.initVm && typeof options.initVm === 'string') {
        pbcopy(`cat ${underpostRoot}/manifests/lxd/underpost-setup.sh | lxc exec ${options.initVm} -- bash`);
      }
    },
  };
}

export default UnderpostLxd;
