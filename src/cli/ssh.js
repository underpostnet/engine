/**
 * SSH module for managing SSH key generation and connection setup.
 * @module src/cli/ssh.js
 * @namespace UnderpostSSH
 */

import { generateRandomPasswordSelection } from '../client/components/core/CommonJs.js';
import { pbcopy, shellExec } from '../server/process.js';
import { loggerFactory } from '../server/logger.js';
import fs from 'fs-extra';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostSSH
 * @description Manages SSH key generation and connection setup.
 * @memberof UnderpostSSH
 */
class UnderpostSSH {
  static API = {
    /**
     * Loads configuration node from disk or returns default empty config.
     * @method
     * @function loadConfigNode
     * @memberof UnderpostSSH
     * @param {string} deployId - Deployment ID for the config path
     * @returns {{confNode: Object, confNodePath: string}} Configuration node and its file path
     * @description Loads or creates a config node with users object structure
     */
    loadConfigNode: (deployId) => {
      const confNodePath = `./engine-private/conf/${deployId}/conf.node.json`;
      const confNode = fs.existsSync(confNodePath) ? JSON.parse(fs.readFileSync(confNodePath, 'utf8')) : { users: {} };
      return { confNode, confNodePath };
    },

    /**
     * Saves configuration node to disk.
     * @method
     * @function saveConfigNode
     * @memberof UnderpostSSH
     * @param {string} confNodePath - Path to the configuration file
     * @param {Object} confNode - Configuration object to save
     * @returns {void}
     */
    saveConfigNode: (confNodePath, confNode) => {
      fs.outputFileSync(confNodePath, JSON.stringify(confNode, null, 4), 'utf8');
    },

    /**
     * Checks if a system user exists.
     * @method
     * @function checkUserExists
     * @memberof UnderpostSSH
     * @param {string} username - Username to check
     * @returns {boolean} True if user exists, false otherwise
     */
    checkUserExists: (username) => {
      const result = shellExec(`id -u ${username} 2>/dev/null || echo "not_found"`, {
        silent: true,
        stdout: true,
      }).trim();
      return result !== 'not_found';
    },

    /**
     * Gets the home directory for a given user.
     * @method
     * @function getUserHome
     * @memberof UnderpostSSH
     * @param {string} username - Username to get home directory for
     * @returns {string} User's home directory path
     */
    getUserHome: (username) => {
      return shellExec(`getent passwd ${username} | cut -d: -f6`, {
        silent: true,
        stdout: true,
      }).trim();
    },

    /**
     * Creates a system user with password and groups.
     * @method
     * @function createSystemUser
     * @memberof UnderpostSSH
     * @param {string} username - Username to create
     * @param {string} password - Password for the user
     * @param {string} groups - Comma-separated list of groups
     * @returns {void}
     */
    createSystemUser: (username, password, groups) => {
      shellExec(`useradd -m -s /bin/bash ${username}`);
      shellExec(`echo "${username}:${password}" | chpasswd`);
      if (groups) {
        for (const group of groups.split(',').map((g) => g.trim())) {
          shellExec(`usermod -aG "${group}" "${username}"`);
        }
      }
    },

    /**
     * Ensures SSH directory exists with proper permissions.
     * @method
     * @function ensureSSHDirectory
     * @memberof UnderpostSSH
     * @param {string} sshDir - Path to SSH directory
     * @returns {void}
     */
    ensureSSHDirectory: (sshDir) => {
      if (!fs.existsSync(sshDir)) {
        shellExec(`mkdir -p ${sshDir}`);
        shellExec(`chmod 700 ${sshDir}`);
      }
    },

    /**
     * Sets proper permissions on SSH files.
     * @method
     * @function setSSHFilePermissions
     * @memberof UnderpostSSH
     * @param {string} sshDir - SSH directory path
     * @param {string} username - Username for ownership
     * @param {string} [keyPath] - Optional private key path
     * @param {string} [pubKeyPath] - Optional public key path
     * @returns {void}
     */
    setSSHFilePermissions: (sshDir, username, keyPath, pubKeyPath) => {
      shellExec(`chmod 600 ${sshDir}/authorized_keys`);
      shellExec(`chmod 644 ${sshDir}/known_hosts`);
      if (keyPath) shellExec(`chmod 600 ${keyPath}`);
      if (pubKeyPath) shellExec(`chmod 644 ${pubKeyPath}`);
      shellExec(`chown -R ${username}:${username} ${sshDir}`);
    },

    /**
     * Configures authorized_keys for a user.
     * @method
     * @function configureAuthorizedKeys
     * @memberof UnderpostSSH
     * @param {string} sshDir - SSH directory path
     * @param {string} pubKeyPath - Public key file path
     * @param {boolean} disablePassword - Whether to add no-forwarding restrictions
     * @returns {void}
     */
    configureAuthorizedKeys: (sshDir, pubKeyPath, disablePassword) => {
      if (disablePassword) {
        shellExec(`cat >> ${sshDir}/authorized_keys <<EOF
no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${fs.readFileSync(pubKeyPath, 'utf8')}
EOF`);
      } else {
        shellExec(`cat ${pubKeyPath} >> ${sshDir}/authorized_keys`);
      }
    },

    /**
     * Configures known_hosts with SSH server keys.
     * @method
     * @function configureKnownHosts
     * @memberof UnderpostSSH
     * @param {string} sshDir - SSH directory path
     * @param {number} port - SSH port number
     * @param {string} [host] - Optional external host to add
     * @returns {void}
     */
    configureKnownHosts: (sshDir, port, host) => {
      shellExec(`ssh-keyscan -p ${port} -H localhost >> ${sshDir}/known_hosts`);
      shellExec(`ssh-keyscan -p ${port} -H 127.0.0.1 >> ${sshDir}/known_hosts`);
      if (host) shellExec(`ssh-keyscan -p ${port} -H ${host} >> ${sshDir}/known_hosts`);
    },

    /**
     * Configures sudoers for passwordless sudo or sets user password.
     * @method
     * @function configureSudoAccess
     * @memberof UnderpostSSH
     * @param {string} username - Username to configure
     * @param {string} password - User password
     * @param {boolean} disablePassword - Whether to enable passwordless sudo
     * @returns {void}
     */
    configureSudoAccess: (username, password, disablePassword) => {
      if (disablePassword) {
        shellExec(`echo '${username} ALL=(ALL) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/90_${username}`);
      } else {
        shellExec(`echo "${username}:${password}" | sudo chpasswd`);
      }
    },

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
     * @param {boolean} [options.disablePassword=false] - If true, enable passwordless sudo and add SSH restrictions
     * @param {boolean} [options.keyTest=false] - Test SSH key generation
     * @param {boolean} [options.stop=false] - Stop SSH service
     * @param {boolean} [options.status=false] - Check SSH service status
     * @param {boolean} [options.connectUri=false] - Output SSH connection URI
     * @param {boolean} [options.copy=false] - Copy SSH connection URI to clipboard
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
        keyTest: false,
        stop: false,
        status: false,
        connectUri: false,
        copy: false,
      },
    ) => {
      let confNode, confNodePath;

      // Set defaults
      if (!options.user) options.user = 'root';
      if (!options.host) options.host = await Underpost.dns.getPublicIp();
      if (!options.password) options.password = options.disablePassword ? '' : generateRandomPasswordSelection(16);
      if (!options.groups) options.groups = 'wheel';
      if (!options.port) options.port = 22; // Handle connect uri

      const userHome = Underpost.ssh.getUserHome(options.user);
      options.userHome = userHome;

      // Load config and override password and host if user exists in config
      if (options.deployId) {
        const config = Underpost.ssh.loadConfigNode(options.deployId);
        confNode = config.confNode;
        confNodePath = config.confNodePath;

        if (confNode.users && confNode.users[options.user]) {
          if (confNode.users[options.user].host) {
            options.host = confNode.users[options.user].host;
            logger.info(`Using saved host for user ${options.user}: ${options.host}`);
          }
          if (confNode.users[options.user].password === '') {
            options.disablePassword = true;
            options.password = '';
            logger.info(`Using saved empty password for user ${options.user}`);
          } else if (confNode.users[options.user].password) {
            options.disablePassword = false;
            options.password = confNode.users[options.user].password;
            logger.info(`Using saved password for user ${options.user}`);
          }
          options.port = options.port || confNode.users[options.user].port || 22;
        }
      }

      logger.info('options', options);

      // Handle connect uri
      if (options.connectUri) {
        const keyPath = `${userHome}/.ssh/id_rsa`;
        const uri = `ssh ${options.user}@${options.host} -i ${keyPath} -p ${options.port}`;
        if (options.copy) {
          pbcopy(uri);
        } else console.log(uri);
        return;
      }

      // Handle reset operation
      if (options.reset) {
        shellExec(`> ${userHome}/.ssh/authorized_keys`);
        shellExec(`> ${userHome}/.ssh/known_hosts`);
      }

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
        console.log(`user : x : UID : GID : GECOS : home_dir : shell`.blue);
        console.log(filter ? usersOut.replaceAll(filter, filter.red) : usersOut);
      }

      // Handle user removal (works with or without deployId)
      if (options.userRemove) {
        const groups = shellExec(`id -Gn ${options.user}`, { silent: true, stdout: true }).trim().replace(/ /g, ', ');
        shellExec(`userdel -r ${options.user}`);

        // Remove sudoers file if it exists
        const sudoersFile = `/etc/sudoers.d/90_${options.user}`;
        if (fs.existsSync(sudoersFile)) {
          shellExec(`sudo rm -f ${sudoersFile}`);
          logger.info(`Sudoers file removed: ${sudoersFile}`);
        }

        // Remove the private key copy folder and update config only if deployId is provided
        if (options.deployId) {
          if (!confNode) {
            const config = Underpost.ssh.loadConfigNode(options.deployId);
            confNode = config.confNode;
            confNodePath = config.confNodePath;
          }

          const privateCopyDir = `./engine-private/conf/${options.deployId}/users/${options.user}`;
          if (fs.existsSync(privateCopyDir)) {
            fs.removeSync(privateCopyDir);
            logger.info(`Private key copy removed from ${privateCopyDir}`);
          }

          delete confNode.users[options.user];
          Underpost.ssh.saveConfigNode(confNodePath, confNode);
        }

        logger.info(`User removed`);
        if (groups) logger.info(`User removed from groups: ${groups}`);
        return;
      }

      // Handle user addition (works with or without deployId)
      if (options.userAdd) {
        let privateCopyDir, privateKeyPath, publicKeyPath, keysExistInBackup, userExistsInConfig;

        // If deployId is provided, check for existing config and backup keys
        if (options.deployId) {
          if (!confNode) {
            const config = Underpost.ssh.loadConfigNode(options.deployId);
            confNode = config.confNode;
            confNodePath = config.confNodePath;
          }

          userExistsInConfig = confNode.users && confNode.users[options.user];
          privateCopyDir = `./engine-private/conf/${options.deployId}/users/${options.user}`;
          privateKeyPath = `${privateCopyDir}/id_rsa`;
          publicKeyPath = `${privateCopyDir}/id_rsa.pub`;
          keysExistInBackup = fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath);

          // If user exists in config AND keys exist in backup, import those keys
          if (userExistsInConfig && keysExistInBackup) {
            logger.info(`User ${options.user} already exists in config. Importing existing keys...`);

            // Create system user if it doesn't exist
            const userExists = Underpost.ssh.checkUserExists(options.user);
            if (!userExists) {
              Underpost.ssh.createSystemUser(options.user, options.password, options.groups);
            }

            const userHome = Underpost.ssh.getUserHome(options.user);
            const sshDir = `${userHome}/.ssh`;
            Underpost.ssh.ensureSSHDirectory(sshDir);

            const userKeyPath = `${sshDir}/id_rsa`;
            const userPubKeyPath = `${sshDir}/id_rsa.pub`;

            // Import keys from backup
            fs.copyFileSync(privateKeyPath, userKeyPath);
            fs.copyFileSync(publicKeyPath, userPubKeyPath);

            Underpost.ssh.configureAuthorizedKeys(sshDir, userPubKeyPath, options.disablePassword);
            Underpost.ssh.configureSudoAccess(options.user, options.password, options.disablePassword);
            Underpost.ssh.configureKnownHosts(sshDir, options.port, options.host);
            Underpost.ssh.setSSHFilePermissions(sshDir, options.user, userKeyPath, userPubKeyPath);

            logger.info(`Keys imported from ${privateCopyDir} to ${sshDir}`);
            logger.info(`User added with existing keys`);
            return;
          }
        }

        // New user or no existing keys - create new user and generate keys
        Underpost.ssh.createSystemUser(options.user, options.password, options.groups);

        const userHome = Underpost.ssh.getUserHome(options.user);
        const sshDir = `${userHome}/.ssh`;
        Underpost.ssh.ensureSSHDirectory(sshDir);

        const keyPath = `${sshDir}/id_rsa`;
        const pubKeyPath = `${sshDir}/id_rsa.pub`;

        if (!fs.existsSync(keyPath)) {
          shellExec(
            `ssh-keygen -t ed25519 -f ${keyPath} -N "${options.password}" -q -C "${options.user}@${options.host}"`,
          );
        }

        Underpost.ssh.configureAuthorizedKeys(sshDir, pubKeyPath, options.disablePassword);
        Underpost.ssh.configureSudoAccess(options.user, options.password, options.disablePassword);
        Underpost.ssh.configureKnownHosts(sshDir, options.port, options.host);
        Underpost.ssh.setSSHFilePermissions(sshDir, options.user, keyPath, pubKeyPath);

        // Save a copy of the keys to the private folder only if deployId is provided
        if (options.deployId) {
          if (!privateCopyDir) privateCopyDir = `./engine-private/conf/${options.deployId}/users/${options.user}`;
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
          Underpost.ssh.saveConfigNode(confNodePath, confNode);
        }

        logger.info(`User added`);
        return;
      }

      // Handle config user listing (only with deployId)
      if (options.deployId) {
        if (!confNode) {
          const config = Underpost.ssh.loadConfigNode(options.deployId);
          confNode = config.confNode;
          confNodePath = config.confNodePath;
        }

        if (options.userLs && confNode && confNode.users) {
          logger.info(`Users in config:`);
          Object.keys(confNode.users).forEach((user) => {
            logger.info(`- ${user}`);
          });
        }
      }

      // Handle generate root keys
      if (options.generate)
        Underpost.ssh.generateKeys({ user: options.user, password: options.password, host: options.host });

      // Handle list operations
      if (options.keysList) shellExec(`cat ${userHome}/.ssh/authorized_keys`);
      if (options.hostsList) shellExec(`cat ${userHome}/.ssh/known_hosts`);

      // Handle key test
      if (options.keyTest) {
        const keyPath = `${userHome}/.ssh/id_rsa`;
        shellExec(`ssh-keygen -y -f ${keyPath} -P "${options.password}"`);
      }

      // Handle stop server
      if (options.stop) shellExec('service sshd stop');

      // Handle start server
      if (options.start) {
        Underpost.ssh.chmod({ user: options.user });
        Underpost.ssh.initService({ port: options.port });
      }

      // Handle status server
      if (options.status) shellExec('service sshd status');
    },

    /**
     * Synchronously copies a local directory to a remote host over key-only SSH,
     * streaming it as a tar archive (no intermediate file) and fixing ownership.
     * Mirrors the kind-node `tar | docker cp` provisioning pattern but targets a
     * real node via SSH, so node-local hostPath volumes can be materialized on the
     * node where the pod will actually run.
     *
     * Idempotent and re-runnable: `mkdir -p` + `tar -x` overwrite in place. Throws
     * on any SSH/tar failure so an empty-volume deploy is never produced silently.
     *
     * @function copyDirToNode
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP (key-only SSH reachable).
     * @param {string} params.localDir - Local source directory.
     * @param {string} params.remoteDir - Destination directory on the node.
     * @param {number} [params.port=22] - SSH port.
     * @param {string} [params.user='root'] - SSH user (key-only).
     * @param {string} [params.keyPath='./engine-private/deploy/id_rsa'] - Private key path.
     * @param {string} [params.owner='1000:1000'] - chown target on the node (empty to skip).
     * @param {string} [params.mode='755'] - chmod mode on the node (empty to skip).
     * @returns {void}
     */
    copyDirToNode: ({
      host,
      localDir,
      remoteDir,
      port = 22,
      user = 'root',
      keyPath = './engine-private/deploy/id_rsa',
      owner = '1000:1000',
      mode = '755',
    }) => {
      if (!host) throw new Error('copyDirToNode requires a host');
      if (!localDir || !fs.existsSync(localDir)) throw new Error(`copyDirToNode: local dir not found: ${localDir}`);
      if (!remoteDir) throw new Error('copyDirToNode requires a remoteDir');
      shellExec(`chmod 600 ${keyPath}`, { silent: true, silentOnError: true, disableLog: true });
      const sshOpts = `-i ${keyPath} -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port}`;
      shellExec(`ssh ${sshOpts} ${user}@${host} 'mkdir -p ${remoteDir}'`);
      shellExec(`tar -C ${localDir} -c . | ssh ${sshOpts} ${user}@${host} 'tar -C ${remoteDir} -x'`);
      const fixups = `${owner ? `chown -R ${owner} ${remoteDir}; ` : ''}${mode ? `chmod -R ${mode} ${remoteDir}` : ''}`.trim();
      if (fixups) shellExec(`ssh ${sshOpts} ${user}@${host} '${fixups}'`);
    },

    /**
     * Generic SSH remote command runner that SSH execution logic.
     * Executes arbitrary shell commands on a remote server via SSH with proper credential handling.
     * @async
     * @function sshRemoteRunner
     * @param {string} remoteCommand - The command to execute on the remote server
     * @param {Object} options - Configuration options for SSH execution
     * @param {string} [options.deployId] - Deployment ID for credential lookup
     * @param {string} [options.user] - SSH user for credential lookup
     * @param {boolean} [options.dev=false] - Development mode flag
     * @param {string} [options.cd='/home/dd/engine'] - Working directory on remote server
     * @param {boolean} [options.useSudo=true] - Whether to use sudo for command execution
     * @param {boolean} [options.remote=true] - Whether to execute as remote command (if false, runs locally)
     * @returns {Promise<string>} Output from the shell execution
     * @memberof UnderpostSSH
     */
    sshRemoteRunner: async (remoteCommand, options = {}) => {
      const { deployId = '', user = '', dev = false, cd = '/home/dd/engine', useSudo = true, remote = true } = options;

      // If not executing remotely, just run locally
      if (!remote) {
        return shellExec(remoteCommand);
      }

      // Set up SSH credentials from config
      if (deployId && user) {
        await Underpost.ssh.setDefautlSshCredentials({ deployId, user });
      }

      // Build the complete SSH command
      const sshScript = `#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER=$(node bin config get --plain DEFAULT_SSH_USER)
REMOTE_HOST=$(node bin config get --plain DEFAULT_SSH_HOST)
REMOTE_PORT=$(node bin config get --plain DEFAULT_SSH_PORT)
SSH_KEY=$(node bin config get --plain DEFAULT_SSH_KEY_PATH)

chmod 600 "$SSH_KEY"

ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$REMOTE_USER@$REMOTE_HOST" -p $REMOTE_PORT sh <<EOF
${cd ? `cd ${cd}` : ''}
${useSudo ? `sudo -n -- /bin/bash -lc "${remoteCommand}"` : remoteCommand}
EOF
`;

      return shellExec(sshScript, { stdout: true });
    },

    /**
     * Waits until a TCP SSH port becomes reachable on a host.
     * @async
     * @function waitForSshPort
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {number} [params.port=22] - SSH port.
     * @param {number} [params.timeoutMs=600000] - Maximum wait window.
     * @param {number} [params.intervalMs=3000] - Poll interval.
     * @returns {Promise<boolean>} True once the port accepts connections, false on timeout.
     */
    waitForSshPort: async ({ host, port = 22, timeoutMs = 10 * 60 * 1000, intervalMs = 3000 }) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const probe = shellExec(
          `timeout 5 bash -c '</dev/tcp/${host}/${port}' >/dev/null 2>&1 && echo open || echo closed`,
          { silent: true, stdout: true, silentOnError: true, disableLog: true },
        );
        if (`${probe}`.trim() === 'open') return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      logger.warn(`SSH port ${host}:${port} not reachable within timeout`);
      return false;
    },

    /**
     * Waits until a host's SSH port stops accepting connections (e.g. while it
     * reboots). Used to detect a reboot edge before waiting for the port to come
     * back up, so callers don't latch onto the pre-reboot (ephemeral) sshd.
     * @async
     * @function waitForSshPortClosed
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {number} [params.port=22] - SSH port.
     * @param {number} [params.timeoutMs=180000] - Maximum wait window.
     * @param {number} [params.intervalMs=3000] - Poll interval.
     * @returns {Promise<boolean>} True once the port is closed, false on timeout.
     */
    waitForSshPortClosed: async ({ host, port = 22, timeoutMs = 3 * 60 * 1000, intervalMs = 3000 }) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const probe = shellExec(
          `timeout 5 bash -c '</dev/tcp/${host}/${port}' >/dev/null 2>&1 && echo open || echo closed`,
          { silent: true, stdout: true, silentOnError: true, disableLog: true },
        );
        if (`${probe}`.trim() === 'closed') return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return false;
    },

    /**
     * Orchestrates a non-interactive, key-only SSH session against a freshly
     * provisioned host: waits for the port, attempts key-based auth, runs a
     * remote command batch, and returns a structured result. Used by the
     * commissioning flow once the ephemeral runtime reports SSH readiness.
     * @async
     * @function sshExecBatch
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {string} params.command - Remote command batch to execute.
     * @param {number} [params.port=22] - SSH port.
     * @param {string} [params.user='root'] - SSH user (key-only).
     * @param {string} [params.keyPath] - Private key path (defaults to engine deploy key).
     * @param {number} [params.connectTimeoutSec=15] - Per-attempt SSH connect timeout.
     * @param {number} [params.retries=3] - Auth/exec retry attempts.
     * @param {number} [params.retryDelayMs=5000] - Base backoff between retries.
     * @param {number} [params.waitForPortMs=0] - When > 0, wait for the port first.
     * @returns {Promise<{ok: boolean, code: number, stdout: string, stderr: string, attempts: number}>}
     */
    sshExecBatch: async ({
      host,
      command,
      port = 22,
      user = 'root',
      keyPath = './engine-private/deploy/id_rsa',
      connectTimeoutSec = 15,
      retries = 3,
      retryDelayMs = 5000,
      waitForPortMs = 0,
    }) => {
      if (!host) throw new Error('sshExecBatch requires a host');
      if (!command) throw new Error('sshExecBatch requires a command');

      if (waitForPortMs > 0) {
        const reachable = await Underpost.ssh.waitForSshPort({ host, port, timeoutMs: waitForPortMs });
        if (!reachable) return { ok: false, code: 255, stdout: '', stderr: 'ssh port unreachable', attempts: 0 };
      }

      shellExec(`chmod 600 ${keyPath}`, { silent: true, silentOnError: true, disableLog: true });

      const sshOpts = [
        `-i ${keyPath}`,
        `-o BatchMode=yes`,
        `-o PreferredAuthentications=publickey`,
        `-o PubkeyAuthentication=yes`,
        `-o PasswordAuthentication=no`,
        `-o StrictHostKeyChecking=no`,
        `-o UserKnownHostsFile=/dev/null`,
        `-o ConnectTimeout=${connectTimeoutSec}`,
        // Tolerate a freshly-booted node whose network briefly flaps (e.g. while
        // NetworkManager applies a static profile): retry the TCP connect and
        // keep the session alive across short stalls.
        `-o ConnectionAttempts=3`,
        `-o ServerAliveInterval=10`,
        `-o ServerAliveCountMax=6`,
        `-p ${port}`,
      ].join(' ');

      let last = { ok: false, code: 255, stdout: '', stderr: '', attempts: 0 };
      for (let attempt = 1; attempt <= retries; attempt++) {
        const result = shellExec(`ssh ${sshOpts} ${user}@${host} bash -s <<'UNDERPOST_SSH_BATCH_EOF'\n${command}\nUNDERPOST_SSH_BATCH_EOF`, {
          stdout: false,
          silentOnError: true,
          disableLog: true,
        });
        last = {
          ok: result.code === 0,
          code: result.code,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          attempts: attempt,
        };
        if (last.ok) {
          logger.info(`sshExecBatch succeeded on ${user}@${host}:${port} (attempt ${attempt})`);
          return last;
        }
        logger.warn(`sshExecBatch attempt ${attempt}/${retries} failed on ${user}@${host}:${port}`, {
          code: last.code,
          stderr: last.stderr.slice(-400),
        });
        if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
      }
      return last;
    },

    /**
     * Transfers a local script to a remote host and runs it over key-only SSH.
     * The script is base64-encoded so no shell-quoting/escaping is needed, then
     * decoded, made executable, and executed with the given arguments. Reuses
     * sshExecBatch for the actual transport, retries, and structured result.
     * @async
     * @function sshRunScript
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {string} params.scriptPath - Local path to the script to run.
     * @param {string} [params.args=''] - Arguments appended to the remote invocation.
     * @param {object} [params.env={}] - Environment variables exported for the remote run (e.g. secrets). Passed inline to the command, never echoed.
     * @param {string} [params.remotePath='/tmp/underpost-remote-script.sh'] - Remote path to write the script.
     * @param {number} [params.port=22] - SSH port.
     * @param {string} [params.user='root'] - SSH user (key-only).
     * @param {string} [params.keyPath] - Private key path (defaults to engine deploy key).
     * @param {number} [params.retries=3] - Retry attempts.
     * @param {number} [params.waitForPortMs=0] - When > 0, wait for the port first.
     * @returns {Promise<{ok: boolean, code: number, stdout: string, stderr: string, attempts: number}>}
     */
    sshRunScript: async ({
      host,
      scriptPath,
      args = '',
      env = {},
      remotePath = '/tmp/underpost-remote-script.sh',
      port = 22,
      user = 'root',
      keyPath = './engine-private/deploy/id_rsa',
      retries = 3,
      waitForPortMs = 0,
    }) => {
      if (!fs.existsSync(scriptPath)) throw new Error(`sshRunScript: script not found: ${scriptPath}`);
      const b64 = Buffer.from(fs.readFileSync(scriptPath, 'utf8'), 'utf8').toString('base64');
      // Inline env assignments (single-quote escaped) so secrets are exported for
      // the remote run without appearing as logged CLI args.
      const sq = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;
      const envPrefix = Object.entries(env)
        .filter(([, v]) => v !== undefined && v !== null && `${v}` !== '')
        .map(([k, v]) => `${k}=${sq(v)}`)
        .join(' ');
      const command = [
        'set -e',
        `echo '${b64}' | base64 -d > ${remotePath}`,
        `chmod +x ${remotePath}`,
        `${envPrefix ? `${envPrefix} ` : ''}bash ${remotePath} ${args}`,
      ].join('\n');
      return Underpost.ssh.sshExecBatch({ host, port, user, keyPath, retries, waitForPortMs, command });
    },

    /**
     * Loads saved SSH credentials from config and sets them in the UnderpostRootEnv API.
     * @async
     * @function setDefautlSshCredentials
     * @memberof UnderpostSSH
     * @param {Object} options - Options for setting default SSH credentials
     * @param {string} options.deployId - Deployment ID for the config path
     * @param {string} options.user - SSH user name
     * @returns {Promise<void>}
     */
    setDefautlSshCredentials: async (options = { deployId: '', user: '' }) => {
      const confNodePath = `./engine-private/conf/${options.deployId}/conf.node.json`;
      if (fs.existsSync(confNodePath)) {
        const { users } = JSON.parse(fs.readFileSync(confNodePath, 'utf8'));
        const { user, host, keyPath, port } = users[options.user];
        Underpost.env.set('DEFAULT_SSH_USER', user);
        Underpost.env.set('DEFAULT_SSH_HOST', host);
        Underpost.env.set('DEFAULT_SSH_KEY_PATH', keyPath);
        Underpost.env.set('DEFAULT_SSH_PORT', port);
      } else logger.warn(`No SSH config found at ${confNodePath}`);
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
      if (status.match('running')) console.log(status.replaceAll(`running`, `running`.green));
      else {
        logger.error('SSHD service failed to start');
        console.log(status);
      }
    },
  };
}

export default UnderpostSSH;
