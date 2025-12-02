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
        port: 22,
        start: false,
        userAdd: false,
        userRemove: false,
        userLs: false,
        reset: false,
      },
    ) => {
      let confNode, confNodePath;
      if (!options.user) options.user = 'root';
      if (!options.host) options.host = await Dns.getPublicIp();
      if (!options.password) options.password = generateRandomPasswordSelection(16);
      logger.info('options', options);

      if (options.reset) {
        shellExec(`> ~/.ssh/authorized_keys`);
        shellExec(`> ~/.ssh/known_hosts`);
        return;
      }

      if (options.deployId) {
        confNodePath = `./engine-private/conf/${options.deployId}/conf.node.json`;
        confNode = fs.existsSync(confNodePath) ? JSON.parse(fs.readFileSync(confNodePath, 'utf8')) : { users: {} };
        if (options.userAdd) {
          confNode.users[options.user] = {};
          fs.writeFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
          logger.info(`User added`);
          return;
        }
        if (options.userRemove) {
          delete confNode.users[options.user];
          fs.writeFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
          logger.info(`User removed`);
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
