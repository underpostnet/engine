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
    /**
     * Main callback function for SSH operations including user management, key import/export, and SSH service configuration.
     * @async
     * @function callback
     * @memberof UnderpostSSH
     * @param {Object} options - Configuration options for SSH operations
     * @param {string} [options.deployId=''] - Deployment ID context for SSH operations
     * @param {boolean} [options.generate=false] - Generate new SSH credentials
     * @param {string} [options.user=''] - SSH user name (defaults to 'root')
     * @param {string} [options.password=''] - SSH user password (auto-generated if not provided, overridden by saved config if user exists)
     * @param {string} [options.host=''] - SSH host address (defaults to public IP, overridden by saved config if user exists)
     * @param {string} [options.filter=''] - Filter for user/group listings
     * @param {string} [options.groups=''] - Comma-separated list of groups for the user (defaults to 'wheel')
     * @param {number} [options.port=22] - SSH port number
     * @param {boolean} [options.start=false] - Start SSH service with hardened configuration
     * @param {boolean} [options.userAdd=false] - Add a new SSH user and generate keys
     * @param {boolean} [options.userRemove=false] - Remove an SSH user and cleanup keys
     * @param {boolean} [options.userLs=false] - List all SSH users and groups
     * @param {boolean} [options.reset=false] - Reset SSH configuration (clear authorized_keys and known_hosts)
     * @param {boolean} [options.keysList=false] - List authorized SSH keys
     * @param {boolean} [options.hostsList=false] - List known SSH hosts
     * @param {boolean} [options.importKeys=false] - Import keys from private backup to user's SSH directory
     * @param {boolean} [options.exportKeys=false] - Export keys from user's SSH directory to private backup
     * @param {boolean} [options.disablePassword=false] - If true, do not set a password for the user
     * @returns {Promise<void>}
     * @description
     * Handles various SSH operations:
     * - User creation with automatic key generation and backup
     * - User removal with key cleanup
     * - Key import/export between SSH directory and private backup location
     * - SSH service initialization and hardening
     * - User and group listing with optional filtering
     */
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
        disablePassword: false,
      },
    ) => {
      let confNode, confNodePath;
      if (!options.user) options.user = 'root';
      if (!options.host) options.host = await Dns.getPublicIp();
      if (!options.password) options.password = options.disablePassword ? '' : generateRandomPasswordSelection(16);
      if (!options.groups) options.groups = 'wheel';
      if (!options.port) options.port = 22;

      // Load config and override password and host if user exists in config
      if (options.deployId) {
        confNodePath = `./engine-private/conf/${options.deployId}/conf.node.json`;
        confNode = fs.existsSync(confNodePath) ? JSON.parse(fs.readFileSync(confNodePath, 'utf8')) : { users: {} };

        if (confNode.users && confNode.users[options.user]) {
          if (confNode.users[options.user].password) {
            options.password = confNode.users[options.user].password;
            logger.info(`Using saved password for user ${options.user}`);
          }
          if (confNode.users[options.user].host) {
            options.host = confNode.users[options.user].host;
            logger.info(`Using saved host for user ${options.user}: ${options.host}`);
          }
        }
      }

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
        // Config already loaded above, just use it
        if (!confNode) {
          confNodePath = `./engine-private/conf/${options.deployId}/conf.node.json`;
          confNode = fs.existsSync(confNodePath) ? JSON.parse(fs.readFileSync(confNodePath, 'utf8')) : { users: {} };
        }

        if (options.userAdd) {
          // Check if user already exists in config
          const userExistsInConfig = confNode.users && confNode.users[options.user];
          const privateCopyDir = `./engine-private/conf/${options.deployId}/users/${options.user}`;
          const privateKeyPath = `${privateCopyDir}/id_rsa`;
          const publicKeyPath = `${privateCopyDir}/id_rsa.pub`;
          const keysExistInBackup = fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath);

          if (userExistsInConfig && keysExistInBackup) {
            logger.info(`User ${options.user} already exists in config. Importing existing keys...`);

            // Check if system user exists
            const userExists =
              shellExec(`id -u ${options.user} 2>/dev/null || echo "not_found"`, {
                silent: true,
                stdout: true,
              }).trim() !== 'not_found';

            if (!userExists) {
              shellExec(`useradd -m -s /bin/bash ${options.user}`);
              shellExec(`echo "${options.user}:${options.password}" | chpasswd`);
              if (options.groups)
                for (const group of options.groups.split(',').map((g) => g.trim())) {
                  shellExec(`usermod -aG "${group}" "${options.user}"`);
                }
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

            const userKeyPath = `${sshDir}/id_rsa`;
            const userPubKeyPath = `${sshDir}/id_rsa.pub`;

            // Import keys from backup
            fs.copyFileSync(privateKeyPath, userKeyPath);
            fs.copyFileSync(publicKeyPath, userPubKeyPath);
            if (options.disablePassword) {
              shellExec(`cat >> ${sshDir}/authorized_keys <<EOF
command="sudo -i",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${fs.readFileSync(userPubKeyPath, 'utf8')}
EOF`);
            } else shellExec(`cat ${userPubKeyPath} >> ${sshDir}/authorized_keys`);
            shellExec(`ssh-keyscan -p ${options.port} -H localhost >> ${sshDir}/known_hosts`);
            shellExec(`ssh-keyscan -p ${options.port} -H 127.0.0.1 >> ${sshDir}/known_hosts`);
            if (options.host) shellExec(`ssh-keyscan -p ${options.port} -H ${options.host} >> ${sshDir}/known_hosts`);

            shellExec(`chmod 600 ${sshDir}/authorized_keys`);
            shellExec(`chmod 644 ${sshDir}/known_hosts`);
            shellExec(`chmod 600 ${userKeyPath}`);
            shellExec(`chmod 644 ${userPubKeyPath}`);
            shellExec(`chown -R ${options.user}:${options.user} ${sshDir}`);

            logger.info(`Keys imported from ${privateCopyDir} to ${sshDir}`);
            logger.info(`User added with existing keys`);
            return;
          }

          // New user or no existing keys - create new user and generate keys
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

          if (options.disablePassword) {
            shellExec(`cat >> ${sshDir}/authorized_keys <<EOF
command="sudo -i",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${fs.readFileSync(pubKeyPath, 'utf8')}
EOF`);
          } else shellExec(`cat ${pubKeyPath} >> ${sshDir}/authorized_keys`);
          shellExec(`ssh-keyscan -p ${options.port} -H localhost >> ${sshDir}/known_hosts`);
          shellExec(`ssh-keyscan -p ${options.port} -H 127.0.0.1 >> ${sshDir}/known_hosts`);
          if (options.host) shellExec(`ssh-keyscan -p ${options.port} -H ${options.host} >> ${sshDir}/known_hosts`);

          shellExec(`chmod 600 ${sshDir}/authorized_keys`);
          shellExec(`chmod 644 ${sshDir}/known_hosts`);
          shellExec(`chmod 600 ${keyPath}`);
          shellExec(`chmod 644 ${pubKeyPath}`);
          shellExec(`chown -R ${options.user}:${options.user} ${sshDir}`);

          // Save a copy of the keys to the private folder
          fs.ensureDirSync(privateCopyDir);

          const privateKeyCopyPath = `${privateCopyDir}/id_rsa`;
          const publicKeyCopyPath = `${privateCopyDir}/id_rsa.pub`;

          fs.copyFileSync(keyPath, privateKeyCopyPath);
          fs.copyFileSync(pubKeyPath, publicKeyCopyPath);

          logger.info(`Keys backed up to ${privateCopyDir}`);

          confNode.users[options.user] = {
            ...confNode.users[options.user],
            ...options,
            keyPath,
            pubKeyPath,
            privateKeyCopyPath,
            publicKeyCopyPath,
          };
          fs.outputFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
          logger.info(`User added`);
          return;
        }
        if (options.userRemove) {
          const groups = shellExec(`id -Gn ${options.user}`, { silent: true, stdout: true }).trim().replace(/ /g, ', ');
          shellExec(`userdel -r ${options.user}`);

          // Remove the private key copy folder
          const privateCopyDir = `./engine-private/conf/${options.deployId}/users/${options.user}`;
          if (fs.existsSync(privateCopyDir)) {
            fs.removeSync(privateCopyDir);
            logger.info(`Private key copy removed from ${privateCopyDir}`);
          }

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
    /**
     * Generates new SSH ED25519 key pair and stores copies in multiple locations.
     * @function generateKeys
     * @memberof UnderpostSSH
     * @param {Object} params - Key generation parameters
     * @param {string} params.user - Username for the SSH key comment
     * @param {string} params.password - Password to encrypt the private key
     * @param {string} params.host - Host address for the SSH key comment
     * @returns {void}
     * @description
     * Creates a new SSH ED25519 key pair and distributes it to:
     * - User's ~/.ssh/ directory
     * - ./engine-private/deploy/ directory
     * Cleans up temporary key files after copying.
     */
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
    /**
     * Sets proper permissions and ownership for SSH directories and files.
     * @function chmod
     * @memberof UnderpostSSH
     * @param {Object} params - Permission configuration parameters
     * @param {string} params.user - Username for setting ownership
     * @returns {void}
     * @description
     * Applies secure permissions to SSH files:
     * - ~/.ssh/ directory: 700
     * - ~/.ssh/authorized_keys: 600
     * - ~/.ssh/known_hosts: 644
     * - ~/.ssh/id_rsa: 600
     * - /etc/ssh/ssh_host_ed25519_key: 600
     * Sets ownership to specified user for ~/.ssh/ and contents.
     */
    chmod: ({ user }) => {
      shellExec(`sudo chmod 700 ~/.ssh/`);
      shellExec(`sudo chmod 600 ~/.ssh/authorized_keys`);
      shellExec(`sudo chmod 644 ~/.ssh/known_hosts`);
      shellExec(`sudo chmod 600 ~/.ssh/id_rsa`);
      shellExec(`sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`);
      shellExec(`chown -R ${user}:${user} ~/.ssh`);
    },
    /**
     * Initializes and hardens SSH service configuration for RHEL-based systems.
     * @function initService
     * @memberof UnderpostSSH
     * @param {Object} params - Service configuration parameters
     * @param {number} params.port - Port number for SSH service
     * @returns {void}
     * @description
     * Configures SSH daemon with hardened security settings:
     * - Disables password authentication (key-only)
     * - Disables root login
     * - Enables ED25519 host key
     * - Disables X11 forwarding and TCP forwarding
     * - Sets client alive intervals to prevent ghost connections
     * - Configures PAM for RHEL/SELinux compatibility
     *
     * After configuration:
     * - Enables sshd service for auto-start on boot
     * - Restarts sshd service to apply changes
     * - Displays service status with colored output
     */
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
