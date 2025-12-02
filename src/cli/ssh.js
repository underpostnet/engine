/**
 * SSH module for managing SSH key generation and connection setup.
 * @module src/cli/ssh.js
 * @namespace UnderpostSSH
 */

import { generateRandomPasswordSelection } from '../client/components/core/CommonJs.js';
import Dns from '../server/dns.js';
import { shellExec } from '../server/process.js';
import { loggerFactory } from '../server/logger.js';
import fs from 'fs-extra';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostSSH
 * @description Manages SSH key generation and connection setup.
 * @memberof UnderpostSSH
 */
class UnderpostSSH {
  static API = {
    callback: async (
      options = {
        deployId: '',
        generate: false,
        user: '',
        password: '',
        host: '',
        filter: '',
        groups: '',
        port: 22,
        start: false,
        userAdd: false,
        userRemove: false,
        userLs: false,
        reset: false,
        keysList: false,
        hostsList: false,
      },
    ) => {
      let confNode, confNodePath;
      if (!options.user) options.user = 'root';
      if (!options.host) options.host = await Dns.getPublicIp();
      if (!options.password) options.password = generateRandomPasswordSelection(16);
      if (!options.groups) options.groups = 'wheel';
      if (!options.port) options.port = 22;
      let userHome = shellExec(`getent passwd ${options.user} | cut -d: -f6`, { silent: true, stdout: true }).trim();
      options.userHome = userHome;

      logger.info('options', options);

      if (options.reset) {
        shellExec(`> ${userHome}/.ssh/authorized_keys`);
        shellExec(`> ${userHome}/.ssh/known_hosts`);
        return;
      }

      if (options.keysList) shellExec(`cat ${userHome}/.ssh/authorized_keys`);
      if (options.hostsList) shellExec(`cat ${userHome}/.ssh/known_hosts`);

      if (options.userLs) {
        const filter = options.filter ? `${options.filter}` : '';
        const groupsOut = shellExec(`getent group${filter ? ` | grep '${filter}'` : ''}`, {
          silent: true,
          stdout: true,
        });
        const usersOut = shellExec(`getent passwd${filter ? ` | grep '${filter}'` : ''}`, {
          silent: true,
          stdout: true,
        });
        console.log('Groups'.bold.blue);
        console.log(`group_name : password_x : GID(Internal Group ID) : user_list`.blue);
        console.log(filter ? groupsOut.replaceAll(filter, filter.red) : groupsOut);
        console.log('Users'.bold.blue);
        console.log(`usuario : x : UID : GID : GECOS : home_dir : shell`.blue);
        console.log(filter ? usersOut.replaceAll(filter, filter.red) : usersOut);
      }

      if (options.deployId) {
        confNodePath = `./engine-private/conf/${options.deployId}/conf.node.json`;
        confNode = fs.existsSync(confNodePath) ? JSON.parse(fs.readFileSync(confNodePath, 'utf8')) : { users: {} };
        if (options.userAdd) {
          shellExec(`useradd -m -s /bin/bash ${options.user}`);
          shellExec(`echo "${options.user}:${options.password}" | chpasswd`);
          if (options.groups)
            for (const group of options.groups.split(',').map((g) => g.trim())) {
              shellExec(`usermod -aG "${group}" "${options.user}"`);
            }

          const userHome = shellExec(`getent passwd ${options.user} | cut -d: -f6`, {
            silent: true,
            stdout: true,
          }).trim();
          const sshDir = `${userHome}/.ssh`;

          if (!fs.existsSync(sshDir)) {
            shellExec(`mkdir -p ${sshDir}`);
            shellExec(`chmod 700 ${sshDir}`);
          }

          const keyPath = `${sshDir}/id_rsa`;
          const pubKeyPath = `${sshDir}/id_rsa.pub`;

          if (!fs.existsSync(keyPath)) {
            shellExec(
              `ssh-keygen -t ed25519 -f ${keyPath} -N "${options.password}" -q -C "${options.user}@${options.host}"`,
            );
          }

          shellExec(`cat ${pubKeyPath} >> ${sshDir}/authorized_keys`);
          shellExec(`ssh-keyscan -p ${options.port} -H localhost >> ${sshDir}/known_hosts`);
          shellExec(`ssh-keyscan -p ${options.port} -H 127.0.0.1 >> ${sshDir}/known_hosts`);
          if (options.host) shellExec(`ssh-keyscan -p ${options.port} -H ${options.host} >> ${sshDir}/known_hosts`);

          shellExec(`chmod 600 ${sshDir}/authorized_keys`);
          shellExec(`chmod 644 ${sshDir}/known_hosts`);
          shellExec(`chmod 600 ${keyPath}`);
          shellExec(`chmod 644 ${pubKeyPath}`);
          shellExec(`chown -R ${options.user}:${options.user} ${sshDir}`);

          confNode.users[options.user] = {
            ...confNode.users[options.user],
            ...options,
            keyPath,
            pubKeyPath,
          };
          fs.outputFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
          logger.info(`User added`);
          return;
        }
        if (options.userRemove) {
          const groups = shellExec(`id -Gn ${options.user}`, { silent: true, stdout: true }).trim().replace(/ /g, ', ');
          shellExec(`userdel -r ${options.user}`);
          delete confNode.users[options.user];
          fs.outputFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
          logger.info(`User removed`);
          if (groups) logger.info(`User removed from groups: ${groups}`);
          return;
        }
        if (options.userLs) {
          logger.info(`Users:`);
          Object.keys(confNode.users).forEach((user) => {
            logger.info(`- ${user}`);
          });
          return;
        }
      }

      if (options.generate)
        UnderpostSSH.API.generateKeys({ user: options.user, password: options.password, host: options.host });
      if (options.start) {
        UnderpostSSH.API.chmod({ user: options.user });
        UnderpostSSH.API.initService({ port: options.port });
      }
    },
    generateKeys: ({ user, password, host }) => {
      shellExec(`sudo rm -rf ./id_rsa`);
      shellExec(`sudo rm -rf ./id_rsa.pub`);

      shellExec(`ssh-keygen -t ed25519 -f id_rsa -N "${password}" -q -C "${user}@${host}"`);

      shellExec(`sudo cp ./id_rsa ~/.ssh/id_rsa`);
      shellExec(`sudo cp ./id_rsa.pub ~/.ssh/id_rsa.pub`);

      shellExec(`sudo cp ./id_rsa ./engine-private/deploy/id_rsa`);
      shellExec(`sudo cp ./id_rsa.pub ./engine-private/deploy/id_rsa.pub`);

      shellExec(`sudo rm -rf ./id_rsa`);
      shellExec(`sudo rm -rf ./id_rsa.pub`);
    },
    chmod: ({ user }) => {
      shellExec(`sudo chmod 700 ~/.ssh/`);
      shellExec(`sudo chmod 600 ~/.ssh/authorized_keys`);
      shellExec(`sudo chmod 644 ~/.ssh/known_hosts`);
      shellExec(`sudo chmod 600 ~/.ssh/id_rsa`);
      shellExec(`sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`);
      shellExec(`chown -R ${user}:${user} ~/.ssh`);
    },
    initService: ({ port }) => {
      shellExec(
        `sudo tee /etc/ssh/sshd_config <<EOF
# ==============================================================
# RHEL Hardened SSHD Configuration
# ==============================================================

# --- Network Settings ---
Port ${port ? port : '22'}
# Explicitly listen on all interfaces (IPv4 and IPv6)

# --- Host Keys ---
# ED25519 is the modern standard (Fast & Secure)
HostKey /etc/ssh/ssh_host_ed25519_key
# RSA is kept for compatibility with older clients (Optional)
# HostKey /etc/ssh/ssh_host_rsa_key

# --- Logging ---
SyslogFacility AUTHPRIV
# VERBOSE logs the key fingerprint used for login (Audit trail)
LogLevel VERBOSE

# --- Authentication & Security ---
# STRICTLY KEY-BASED AUTHENTICATION
PubkeyAuthentication yes
PasswordAuthentication no
ChallengeResponseAuthentication no
PermitEmptyPasswords no

# PREVENT ROOT LOGIN
# Administrators should log in as a standard user and use 'sudo'
PermitRootLogin no

# Security checks on ownership of ~/.ssh/ files
StrictModes yes
MaxAuthTries 3
LoginGraceTime 60

# --- PAM (Pluggable Authentication Modules) ---
# REQUIRED: Must be 'yes' on RHEL for proper session/SELinux handling.
# Since PasswordAuthentication is 'no', PAM will not ask for passwords.
UsePAM yes

# --- Session & Network Health ---
# Disconnect idle sessions after 5 minutes (300s * 0) to prevent ghost connections
ClientAliveInterval 300
ClientAliveCountMax 0

# --- Feature Restrictions ---
# Disable GUI forwarding unless explicitly needed
X11Forwarding no
# Disable DNS checks for faster logins (unless you use Host based auth)
UseDNS no
# Disable tunneling unless needed
PermitTunnel no
AllowTcpForwarding no

# --- Subsystem ---
Subsystem sftp /usr/libexec/openssh/sftp-server
EOF`,
        { disableLog: true },
      );
      shellExec(`sudo systemctl enable sshd`);
      shellExec(`sudo systemctl restart sshd`);

      const status = shellExec(`sudo systemctl status sshd`, { silent: true, stdout: true });
      console.log(
        status.match('running') ? status.replaceAll(`running`, `running`.green) : `ssh service not running`.red,
      );
    },
  };
}

export default UnderpostSSH;
