/**
 * SSH module for managing SSH key generation and connection setup.
 * @module src/cli/ssh.js
 * @namespace UnderpostSSH
 */

import { generateRandomPasswordSelection } from '../client/components/core/CommonJs.js';
import { pbcopy, shellExec } from '../server/process.js';
import { loggerFactory } from '../server/logger.js';
import { waitForPort } from '../server/conf.js';
import {
  runSELinuxCommands,
  selinuxPackagesCommandFactory,
  selinuxRestoreconCommandFactory,
  selinuxSshContextCommandsFactory,
  selinuxSshPortCommandsFactory,
  shellArgumentFactory,
} from '../server/selinux.js';
import fs from 'fs-extra';
import Underpost from '../index.js';

const logger = loggerFactory(import.meta);

/**
 * SSH users are cluster scoped: one registry and one key store serve every
 * deploy id running on the cluster, so an account is provisioned once instead
 * of once per app.
 *
 * A record is `{ user, password, groups, keyPath, pubKeyPath, hosts }`, where an
 * empty password means key-only and `hosts` carries one connection per host:
 *
 *   hosts: [{ host: '10.0.0.2', port: 22 }, { host: '10.0.0.3', port: 22 }]
 *
 * One account reaches many hosts — the same operator account on every WireGuard
 * spoke is the normal case — so the host cannot be a field of the record. It was,
 * and registering that account for a second host silently replaced the first,
 * leaving remediation unable to resolve a spoke it had just been given.
 *
 * The port belongs to the connection for the same reason: two hosts of one
 * account can listen on different ports, and a single record-level port could
 * only describe one of them.
 */
const USERS_CONF_PATH = './engine-private/deploy/conf.users.json';
const USERS_KEYS_PATH = './engine-private/deploy/users';
const DEFAULT_SSH_PORT = 22;

/**
 * @method hostNameFactory
 * @description A host as the registry compares it: the bare address, so a value
 * written with a prefix (`10.0.0.2/32`) matches one without.
 * @param {string} host - Host or IP, with or without a CIDR suffix.
 * @returns {string} Normalized host.
 * @memberof UnderpostSSH
 */
const hostNameFactory = (host) => `${host || ''}`.trim().split('/')[0];

/**
 * @method connectionFactory
 * @description Normalizes one connection entry.
 * @param {object} [connection] - Raw connection entry.
 * @returns {?{host: string, port: number}} Normalized connection, or null without a host.
 * @memberof UnderpostSSH
 */
const connectionFactory = (connection = {}) => {
  const host = hostNameFactory(connection.host);
  return host ? { host, port: Number(connection.port) || DEFAULT_SSH_PORT } : null;
};

/**
 * @method upsertConnection
 * @description Adds a connection to a host list, replacing the entry for that
 * host when one is already present.
 *
 * The one write path for `hosts`, so re-registering an account for a host it
 * already reaches updates that connection instead of appending a duplicate the
 * reverse lookup would then have to choose between.
 * @param {Array<{host: string, port: number}>} [hosts] - Existing connections.
 * @param {object} connection - Connection to add.
 * @returns {Array<{host: string, port: number}>} Updated connections.
 * @memberof UnderpostSSH
 */
const upsertConnection = (hosts = [], connection) => {
  const entry = connectionFactory(connection);
  if (!entry) return hosts;
  return [...hosts.filter((existing) => existing.host !== entry.host), entry];
};

/**
 * @method userRecordFactory
 * @description Normalizes one registry entry, so every consumer reads one shape
 * whether the file was written by hand, partially, or not at all.
 * @param {object} [entry] - Raw registry entry.
 * @returns {object} Normalized record.
 * @memberof UnderpostSSH
 */
const userRecordFactory = (entry = {}) => ({
  user: `${entry.user || ''}`.trim(),
  password: `${entry.password ?? ''}`,
  groups: `${entry.groups || ''}`,
  keyPath: `${entry.keyPath || ''}`,
  pubKeyPath: `${entry.pubKeyPath || ''}`,
  hosts: (Array.isArray(entry.hosts) ? entry.hosts : []).reduce(
    (hosts, connection) => upsertConnection(hosts, connection),
    [],
  ),
});

/**
 * @class UnderpostSSH
 * @description Manages SSH key generation and connection setup.
 * @memberof UnderpostSSH
 */
class UnderpostSSH {
  static API = {
    /**
     * Path of the cluster users registry.
     * @method
     * @function usersConfPath
     * @memberof UnderpostSSH
     * @returns {string} Path to the users configuration file
     */
    usersConfPath: () => USERS_CONF_PATH,

    /**
     * Key store directory for a user.
     * @method
     * @function userKeyDir
     * @memberof UnderpostSSH
     * @param {string} user - SSH user name
     * @returns {string} Directory holding `<dir>/id_rsa` and `<dir>/id_rsa.pub`
     */
    userKeyDir: (user) => `${USERS_KEYS_PATH}/${user}`,

    /**
     * Loads the cluster users registry from disk.
     * @method
     * @function loadUsers
     * @memberof UnderpostSSH
     * @returns {Array<Object>} Registered user records, empty when unregistered
     */
    loadUsers: () =>
      (fs.existsSync(USERS_CONF_PATH) ? JSON.parse(fs.readFileSync(USERS_CONF_PATH, 'utf8')) : [])
        .map(userRecordFactory)
        .filter((entry) => entry.user),

    /**
     * Saves the cluster users registry to disk.
     * @method
     * @function saveUsers
     * @memberof UnderpostSSH
     * @param {Array<Object>} users - User records to persist
     * @returns {void}
     */
    saveUsers: (users) => {
      fs.outputFileSync(USERS_CONF_PATH, JSON.stringify(users.map(userRecordFactory), null, 2), 'utf8');
    },

    /**
     * Looks up a registered user record.
     * @method
     * @function findUser
     * @memberof UnderpostSSH
     * @param {string} user - SSH user name
     * @returns {Object|undefined} The record, or undefined when unregistered
     */
    findUser: (user) => Underpost.ssh.loadUsers().find((entry) => entry.user === user),

    /**
     * Resolves the connection an account uses to reach one host.
     * @method
     * @function resolveConnection
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Host or IP the account was registered against.
     * @param {string} [params.user] - Restrict the lookup to this account.
     * @returns {Object|undefined} Flat connection `{ user, host, port, password, keyPath, pubKeyPath }`, or undefined
     * @description
     * The reverse of {@link UnderpostSSH.findUser}, for callers that know where
     * they must act but not who acts there — remediation resolving a WireGuard
     * spoke's tunnel address to the account that can repair it. Returns the flat
     * view every SSH caller needs, so no consumer has to know the registry is
     * keyed by host.
     */
    resolveConnection: ({ host, user = '' } = {}) => {
      const target = hostNameFactory(host);
      if (!target) return undefined;
      for (const record of Underpost.ssh.loadUsers()) {
        if (user && record.user !== user) continue;
        const connection = record.hosts.find((entry) => entry.host === target);
        if (!connection) continue;
        return {
          user: record.user,
          host: connection.host,
          port: connection.port,
          password: record.password,
          keyPath: record.keyPath,
          pubKeyPath: record.pubKeyPath,
        };
      }
      return undefined;
    },

    /**
     * Lists every host an account is registered for.
     * @method
     * @function userHosts
     * @memberof UnderpostSSH
     * @param {string} user - SSH user name
     * @returns {Array<{host: string, port: number}>} Connection metadata per host
     */
    userHosts: (user) => Underpost.ssh.findUser(user)?.hosts || [],

    /**
     * Checks if a system user exists.
     * @method
     * @function checkUserExists
     * @memberof UnderpostSSH
     * @param {string} username - Username to check
     * @returns {boolean} True if user exists, false otherwise
     */
    checkUserExists: (username) => {
      const result = shellExec(`id -u ${shellArgumentFactory(username)} 2>/dev/null || echo "not_found"`, {
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
      return shellExec(`getent passwd ${shellArgumentFactory(username)} | cut -d: -f6`, {
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
      if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(username)) throw new TypeError('Invalid system username');
      shellExec(`useradd -m -s /bin/bash ${shellArgumentFactory(username)}`);
      shellExec(`printf '%s\n' ${shellArgumentFactory(`${username}:${password}`)} | chpasswd`, { disableLog: true });
      if (groups) {
        for (const group of groups.split(',').map((g) => g.trim())) {
          if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(group)) throw new TypeError('Invalid system group');
          shellExec(`usermod -aG ${shellArgumentFactory(group)} ${shellArgumentFactory(username)}`);
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
        shellExec(`mkdir -p ${shellArgumentFactory(sshDir)}`);
        shellExec(`chmod 700 ${shellArgumentFactory(sshDir)}`);
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
      shellExec(`chmod 600 ${shellArgumentFactory(`${sshDir}/authorized_keys`)}`);
      shellExec(`chmod 644 ${shellArgumentFactory(`${sshDir}/known_hosts`)}`);
      if (keyPath) shellExec(`chmod 600 ${shellArgumentFactory(keyPath)}`);
      if (pubKeyPath) shellExec(`chmod 644 ${shellArgumentFactory(pubKeyPath)}`);
      shellExec(`chown -R ${shellArgumentFactory(`${username}:${username}`)} ${shellArgumentFactory(sshDir)}`);
      runSELinuxCommands(selinuxSshContextCommandsFactory({ sshDirectory: sshDir }), { execute: shellExec });
    },

    /**
     * Configures authorized_keys for a user.
     * @method
     * @function configureAuthorizedKeys
     * @memberof UnderpostSSH
     * @param {string} sshDir - SSH directory path
     * @param {string} pubKeyPath - Public key file path
     * @param {boolean} restrictForwarding - Whether to add no-forwarding restrictions
     * @returns {void}
     */
    configureAuthorizedKeys: (sshDir, pubKeyPath, restrictForwarding) => {
      const key = fs.readFileSync(pubKeyPath, 'utf8').trim();
      const entry = restrictForwarding ? `no-port-forwarding,no-X11-forwarding,no-agent-forwarding ${key}` : key;
      const authorizedKeysPath = `${sshDir}/authorized_keys`;
      shellExec(
        `grep -qxF ${shellArgumentFactory(entry)} ${shellArgumentFactory(authorizedKeysPath)} || printf '%s\n' ${shellArgumentFactory(entry)} >> ${shellArgumentFactory(authorizedKeysPath)}`,
      );
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
      const sshPort = Number(port);
      if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535)
        throw new RangeError('SSH port must be 1-65535');
      const knownHostsPath = shellArgumentFactory(`${sshDir}/known_hosts`);
      shellExec(`ssh-keyscan -p ${sshPort} -H localhost >> ${knownHostsPath}`);
      shellExec(`ssh-keyscan -p ${sshPort} -H 127.0.0.1 >> ${knownHostsPath}`);
      if (host) shellExec(`ssh-keyscan -p ${sshPort} -H ${shellArgumentFactory(host)} >> ${knownHostsPath}`);
    },

    /**
     * Grants passwordless sudo to a key-only account, or sets the user password.
     * @method
     * @function configureSudoAccess
     * @memberof UnderpostSSH
     * @param {string} username - Username to configure
     * @param {string} password - User password; empty means key-only
     * @returns {void}
     */
    configureSudoAccess: (username, password) => {
      if (!password) {
        if (!/^[a-z_][a-z0-9_-]*[$]?$/i.test(username)) throw new TypeError('Invalid sudo username');
        const sudoersPath = `/etc/sudoers.d/90_${username}`;
        const temporaryPath = `/tmp/underpost-sudoers-${process.pid}-${username}`;
        const rule = `${username} ALL=(ALL) NOPASSWD: ALL`;
        try {
          shellExec(`printf '%s\n' ${shellArgumentFactory(rule)} > ${shellArgumentFactory(temporaryPath)}`);
          shellExec(`sudo visudo -cf ${shellArgumentFactory(temporaryPath)}`);
          shellExec(
            `sudo install -m 0440 -o root -g root ${shellArgumentFactory(temporaryPath)} ${shellArgumentFactory(sudoersPath)}`,
          );
          runSELinuxCommands([selinuxRestoreconCommandFactory(sudoersPath, { recursive: false })], {
            execute: shellExec,
          });
        } finally {
          fs.removeSync(temporaryPath);
        }
      } else {
        shellExec(`printf '%s\n' ${shellArgumentFactory(`${username}:${password}`)} | sudo chpasswd`, {
          disableLog: true,
        });
      }
    },

    /**
     * Initializes the default SSH files and credentials for a local SSH service.
     * @method
     * @function initializeDefaultSshConfig
     * @memberof UnderpostSSH
     * @param {object} params - SSH configuration values.
     * @param {string} params.user - SSH user name.
     * @param {string} params.password - SSH key passphrase and user password; empty means key-only.
     * @param {string} params.host - Host used in the SSH key comment.
     * @param {number} params.port - SSH port.
     * @param {string} [params.controllerPubKeyPath='./engine-private/deploy/id_rsa.pub'] - Preferred controller public key to authorize.
     * @returns {void}
     */
    initializeDefaultSshConfig: ({
      user,
      password,
      host,
      port,
      controllerPubKeyPath = './engine-private/deploy/id_rsa.pub',
    }) => {
      const sshDir = `${Underpost.ssh.getUserHome(user)}/.ssh`;
      const keyPath = `${sshDir}/id_rsa`;
      const pubKeyPath = `${sshDir}/id_rsa.pub`;

      Underpost.ssh.ensureSSHDirectory(sshDir);
      fs.ensureFileSync(`${sshDir}/authorized_keys`);
      fs.ensureFileSync(`${sshDir}/known_hosts`);

      if (!fs.existsSync(keyPath)) {
        shellExec(
          `ssh-keygen -t ed25519 -f ${shellArgumentFactory(keyPath)} -N ${shellArgumentFactory(password)} -q -C ${shellArgumentFactory(`${user}@${host}`)}`,
          { disableLog: true },
        );
      }
      if (!fs.existsSync(pubKeyPath))
        shellExec(
          `ssh-keygen -y -f ${shellArgumentFactory(keyPath)} -P ${shellArgumentFactory(password)} > ${shellArgumentFactory(pubKeyPath)}`,
          { disableLog: true },
        );

      const authorizedKeyPath = fs.existsSync(controllerPubKeyPath) ? controllerPubKeyPath : pubKeyPath;
      Underpost.ssh.configureAuthorizedKeys(sshDir, authorizedKeyPath, !password);
      Underpost.ssh.configureKnownHosts(sshDir, port, host);
      Underpost.ssh.configureSudoAccess(user, password);
      Underpost.ssh.setSSHFilePermissions(sshDir, user, keyPath, pubKeyPath);
    },

    /**
     * Main callback function for SSH operations including user management, key import/export, and SSH service configuration.
     * @async
     * @function callback
     * @memberof UnderpostSSH
     * @param {Object} options - Configuration options for SSH operations
     * @param {boolean} [options.generate=false] - Generate new SSH credentials
     * @param {string} [options.user=''] - SSH user name (defaults to 'root')
     * @param {string} [options.password=''] - SSH user password (taken from the registry, else generated unless --disable-password)
     * @param {string} [options.host=''] - SSH host address (taken from the registry, else the public IP)
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
     * @param {boolean} [options.disablePassword=false] - Create the account key-only instead of generating a password
     * @param {boolean} [options.keyTest=false] - Test SSH key generation
     * @param {boolean} [options.stop=false] - Stop SSH service
     * @param {boolean} [options.status=false] - Check SSH service status
     * @param {boolean} [options.connectUri=false] - Output SSH connection URI
     * @param {boolean} [options.copy=false] - Copy SSH connection URI to clipboard
     * @returns {Promise<void>}
     * @description
     * Handles SSH operations against the cluster users registry
     * (`engine-private/deploy/conf.users.json`) and key store
     * (`engine-private/deploy/users/<user>`):
     * - User creation with automatic key generation and backup
     * - User removal with key cleanup
     * - Key import/export between SSH directory and the key store
     * - SSH service initialization and hardening
     * - User and group listing with optional filtering
     */
    callback: async (
      options = {
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
      if (!options.user) options.user = 'root';

      const users = Underpost.ssh.loadUsers();
      const confUserIndex = users.findIndex((entry) => entry.user === options.user);
      const confUser = users[confUserIndex];
      const registeredHosts = confUser?.hosts || [];

      // Explicit flags win; the registry fills in what was omitted, but only for
      // the operations that act on one host. A single registered host is
      // unambiguous and several are not — an account on many spokes must be told
      // which one is meant rather than acting on whichever the registry lists
      // first. Listing and removal are account-scoped and need no host at all.
      const hostScoped = options.connectUri || options.userAdd || options.start || options.keyTest || options.hostsList;
      if (!options.host && hostScoped) {
        if (registeredHosts.length > 1)
          throw new Error(
            `[ssh] user '${options.user}' is registered for several hosts ` +
              `(${registeredHosts.map((entry) => entry.host).join(', ')}); pass --host to select one`,
          );
        options.host = registeredHosts[0]?.host || (await Underpost.dns.getPublicIp());
      }
      if (!options.port)
        options.port =
          registeredHosts.find((entry) => entry.host === hostNameFactory(options.host))?.port || DEFAULT_SSH_PORT;
      if (!options.groups) options.groups = 'wheel';
      if (!options.password) {
        const generatePassword = !confUser && !options.disablePassword;
        options.password = generatePassword ? generateRandomPasswordSelection(16) : confUser?.password || '';
      }

      const keyDir = Underpost.ssh.userKeyDir(options.user);
      const keyPath = confUser?.keyPath || `${keyDir}/id_rsa`;
      const pubKeyPath = confUser?.pubKeyPath || `${keyDir}/id_rsa.pub`;
      const sshDirFactory = () => `${Underpost.ssh.getUserHome(options.user)}/.ssh`;

      logger.info('options', options);

      if (options.connectUri) {
        const uri = `ssh ${options.user}@${options.host} -i ${keyPath} -p ${options.port}`;
        if (options.copy) pbcopy(uri);
        else console.log(uri);
        return;
      }

      if (options.reset) {
        const sshDir = sshDirFactory();
        shellExec(`> ${sshDir}/authorized_keys`);
        shellExec(`> ${sshDir}/known_hosts`);
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
        console.log('Registered cluster users'.bold.blue);
        users.forEach((entry) =>
          entry.hosts.forEach((connection) => console.log(`${entry.user}@${connection.host}:${connection.port}`)),
        );
      }

      if (options.userRemove) {
        const groups = shellExec(`id -Gn ${options.user}`, { silent: true, stdout: true }).trim().replace(/ /g, ', ');
        shellExec(`userdel -r ${options.user}`);

        const sudoersFile = `/etc/sudoers.d/90_${options.user}`;
        if (fs.existsSync(sudoersFile)) {
          shellExec(`sudo rm -f ${sudoersFile}`);
          logger.info(`Sudoers file removed: ${sudoersFile}`);
        }

        if (fs.existsSync(keyDir)) {
          fs.removeSync(keyDir);
          logger.info(`Key store removed from ${keyDir}`);
        }

        if (confUser) {
          users.splice(confUserIndex, 1);
          Underpost.ssh.saveUsers(users);
        }

        logger.info(`User removed`);
        if (groups) logger.info(`User removed from groups: ${groups}`);
        return;
      }

      if (options.userAdd) {
        if (!Underpost.ssh.checkUserExists(options.user))
          Underpost.ssh.createSystemUser(options.user, options.password, options.groups);

        const sshDir = sshDirFactory();
        Underpost.ssh.ensureSSHDirectory(sshDir);
        const hostKeyPath = `${sshDir}/id_rsa`;
        const hostPubKeyPath = `${sshDir}/id_rsa.pub`;

        // A key already trusted cluster wide is reinstalled, never re-issued:
        // regenerating it would invalidate every host that already holds it.
        const storedKeys = fs.existsSync(keyPath) && fs.existsSync(pubKeyPath);
        if (storedKeys) {
          fs.copyFileSync(keyPath, hostKeyPath);
          fs.copyFileSync(pubKeyPath, hostPubKeyPath);
          logger.info(`Keys imported from ${keyDir} to ${sshDir}`);
        } else if (!fs.existsSync(hostKeyPath)) {
          shellExec(
            `ssh-keygen -t ed25519 -f ${hostKeyPath} -N "${options.password}" -q -C "${options.user}@${options.host}"`,
            { disableLog: true },
          );
        } else if (!fs.existsSync(hostPubKeyPath)) {
          shellExec(`ssh-keygen -y -f ${hostKeyPath} -P "${options.password}" > ${hostPubKeyPath}`, {
            disableLog: true,
          });
        }

        Underpost.ssh.configureAuthorizedKeys(sshDir, hostPubKeyPath, !options.password);
        Underpost.ssh.configureSudoAccess(options.user, options.password);
        Underpost.ssh.configureKnownHosts(sshDir, options.port, options.host);
        Underpost.ssh.setSSHFilePermissions(sshDir, options.user, hostKeyPath, hostPubKeyPath);

        if (!storedKeys) {
          fs.ensureDirSync(keyDir);
          fs.copyFileSync(hostKeyPath, keyPath);
          fs.copyFileSync(hostPubKeyPath, pubKeyPath);
          logger.info(`Keys backed up to ${keyDir}`);
        }

        // Additive: registering the account for another host adds that host,
        // it does not replace the record. One operator account across several
        // spokes is the normal case, and replacing here is what previously left
        // remediation unable to resolve a spoke that had just been registered.
        const record = {
          ...(confUser || {}),
          user: options.user,
          password: options.password,
          groups: options.groups,
          keyPath,
          pubKeyPath,
          hosts: upsertConnection(registeredHosts, { host: options.host, port: options.port }),
        };
        if (confUser) users[confUserIndex] = record;
        else users.push(record);
        Underpost.ssh.saveUsers(users);

        logger.info(`User added`, { user: options.user, hosts: record.hosts });
        return;
      }

      if (options.generate)
        Underpost.ssh.generateKeys({ user: options.user, password: options.password, host: options.host });

      if (options.keysList) shellExec(`cat ${sshDirFactory()}/authorized_keys`);
      if (options.hostsList) shellExec(`cat ${sshDirFactory()}/known_hosts`);

      if (options.keyTest) shellExec(`ssh-keygen -y -f ${keyPath} -P "${options.password}"`);

      if (options.stop) shellExec('service sshd stop');

      if (options.start) {
        if (!confUser) {
          Underpost.ssh.initializeDefaultSshConfig({
            user: options.user,
            password: options.password,
            host: options.host,
            port: options.port,
          });
        } else {
          // Hardening sshd on a host where the account does not exist produces a
          // daemon that starts cleanly and refuses the only user it was meant to
          // admit. Nothing downstream reports that, so the run has to.
          if (!Underpost.ssh.checkUserExists(options.user))
            throw new Error(
              `[ssh] user '${options.user}' does not exist on this host; ` +
                `run: node bin ssh --user ${options.user} --user-add`,
            );
          // The registry records the key pair this cluster authenticates with, so
          // a box whose authorized_keys was lost converges here rather than
          // needing the key re-issued — which would invalidate every other host
          // holding it.
          if (fs.existsSync(pubKeyPath)) {
            const sshDir = sshDirFactory();
            Underpost.ssh.ensureSSHDirectory(sshDir);
            fs.ensureFileSync(`${sshDir}/authorized_keys`);
            Underpost.ssh.configureAuthorizedKeys(sshDir, pubKeyPath, !options.password);
            logger.info(`Authorized key present for ${options.user}`, { source: pubKeyPath });
          } else {
            logger.warn('Registered public key is missing; authorized_keys left untouched', {
              user: options.user,
              expected: pubKeyPath,
            });
          }
          Underpost.ssh.chmod({ user: options.user });
        }
        Underpost.ssh.initService({ port: options.port });
      }

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
      try {
        shellExec(`chmod 600 ${keyPath}`, { silent: true, silentOnError: true, disableLog: true });
        const sshOpts = `-i ${keyPath} -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port}`;
        shellExec(`ssh ${sshOpts} ${user}@${host} 'mkdir -p ${remoteDir}'`, {
          silent: true,
          disableLog: true,
        });
        shellExec(`tar -C ${localDir} -c . | ssh ${sshOpts} ${user}@${host} 'tar -C ${remoteDir} -x'`, {
          silent: true,
          disableLog: true,
        });
        const fixups =
          `${owner ? `chown -R ${owner} ${remoteDir}; ` : ''}${mode ? `chmod -R ${mode} ${remoteDir}` : ''}`.trim();
        if (fixups)
          shellExec(`ssh ${sshOpts} ${user}@${host} '${fixups}'`, {
            silent: true,
            disableLog: true,
          });
      } catch (err) {
        logger.error(`copyDirToNode failed`);
        process.exit(1);
      }
    },

    /**
     * Generic SSH remote command runner that SSH execution logic.
     * Executes arbitrary shell commands on a remote server via SSH with proper credential handling.
     * @async
     * @function sshRemoteRunner
     * @param {string} remoteCommand - The command to execute on the remote server
     * @param {Object} options - Configuration options for SSH execution
     * @param {string} [options.user] - SSH user for cluster credential lookup
     * @param {string} [options.host] - Host to reach; selects the connection when the user has several
     * @param {boolean} [options.dev=false] - Development mode flag
     * @param {string} [options.cd='/home/dd/engine'] - Working directory on remote server
     * @param {boolean} [options.useSudo=true] - Whether to use sudo for command execution
     * @param {boolean} [options.remote=true] - Whether to execute as remote command (if false, runs locally in `cd`)
     * @param {boolean} [options.silent=false] - Suppress the command's output; it is still returned to the caller
     * @returns {Promise<string>} Output from the shell execution
     * @memberof UnderpostSSH
     */
    sshRemoteRunner: async (remoteCommand, options = {}) => {
      const {
        user = '',
        host = '',
        dev = false,
        cd = '/home/dd/engine',
        useSudo = true,
        remote = true,
        silent = false,
      } = options;

      // Local execution still honours `cd`: the underpost CLI resolves its deploy
      // configuration relative to the working directory, so running it from
      // wherever the caller happened to start would act on a different cluster's
      // config, or none.
      // The generated wrapper is transport, not information: echoing it buries
      // whatever the command actually said under a page of boilerplate.
      if (!remote) return shellExec(remoteCommand, { ...(cd ? { cwd: cd } : {}), silent, disableLog: true });

      // Set up SSH credentials from the cluster config
      if (user) await Underpost.ssh.setDefautlSshCredentials({ user, host });

      // Build the complete SSH command
      const sshScript = `#!/usr/bin/env bash
set -euo pipefail

REMOTE_USER=$(node bin config get --plain DEFAULT_SSH_USER)
REMOTE_HOST=$(node bin config get --plain DEFAULT_SSH_HOST)
REMOTE_PORT=$(node bin config get --plain DEFAULT_SSH_PORT)
SSH_KEY=$(node bin config get --plain DEFAULT_SSH_KEY_PATH)

chmod 600 "$SSH_KEY"

ssh -i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR "$REMOTE_USER@$REMOTE_HOST" -p $REMOTE_PORT sh <<EOF
${cd ? `cd ${cd}` : ''}
${useSudo ? `sudo -n -- /bin/bash -lc "${remoteCommand}"` : remoteCommand}
EOF
`;

      return shellExec(sshScript, { stdout: true, silent, disableLog: true });
    },

    /**
     * Waits until a TCP SSH port becomes reachable on a host. Delegates to
     * {@link ServerConfBuilder.waitForPort}, which owns the probe.
     * @function waitForSshPort
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {number} [params.port=22] - SSH port.
     * @param {number} [params.timeoutMs=600000] - Maximum wait window.
     * @param {number} [params.intervalMs=3000] - Poll interval.
     * @returns {Promise<boolean>} True once the port accepts connections, false on timeout.
     */
    waitForSshPort: ({ host, port = 22, timeoutMs = 10 * 60 * 1000, intervalMs = 3000 }) =>
      waitForPort({ host, port, open: true, timeoutMs, intervalMs }),

    /**
     * Waits until a host's SSH port stops accepting connections (e.g. while it
     * reboots). Used to detect a reboot edge before waiting for the port to come
     * back up, so callers don't latch onto the pre-reboot (ephemeral) sshd.
     * Delegates to {@link ServerConfBuilder.waitForPort}.
     * @function waitForSshPortClosed
     * @memberof UnderpostSSH
     * @param {object} params
     * @param {string} params.host - Target host/IP.
     * @param {number} [params.port=22] - SSH port.
     * @param {number} [params.timeoutMs=180000] - Maximum wait window.
     * @param {number} [params.intervalMs=3000] - Poll interval.
     * @returns {Promise<boolean>} True once the port is closed, false on timeout.
     */
    waitForSshPortClosed: ({ host, port = 22, timeoutMs = 3 * 60 * 1000, intervalMs = 3000 }) =>
      waitForPort({ host, port, open: false, timeoutMs, intervalMs }),

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
        const result = shellExec(
          `ssh ${sshOpts} ${user}@${host} bash -s <<'UNDERPOST_SSH_BATCH_EOF'\n${command}\nUNDERPOST_SSH_BATCH_EOF`,
          {
            stdout: false,
            silentOnError: true,
            disableLog: true,
          },
        );
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
     * Loads a user's SSH credentials for one host and sets them in the
     * UnderpostRootEnv API.
     *
     * `host` is what selects the connection: an account registered for several
     * hosts has several, and picking one without being told would send a repair
     * to the wrong machine. Omitting it is only unambiguous for an account with
     * exactly one registered host.
     *
     * A named host is resolved against the registry and nowhere else. The root
     * env store is ambient — whatever the previous command left there — so
     * substituting it for a host the registry does not know would silently point
     * an operation at a different machine, which for remediation means repairing
     * one host because another was unreachable. Its `DEFAULT_SSH_*` values are
     * promoted only when no host was named, for a controller that dispatches
     * work but was never itself provisioned by `--user-add`.
     * @async
     * @function setDefautlSshCredentials
     * @memberof UnderpostSSH
     * @param {Object} options - Options for setting default SSH credentials
     * @param {string} options.user - SSH user name registered at cluster scope
     * @param {string} [options.host] - Host to connect to; required when the account has several
     * @returns {Promise<void>}
     * @throws {Error} When a named host has no connection registered for that account.
     */
    setDefautlSshCredentials: async (options = { user: '', host: '' }) => {
      const hosts = Underpost.ssh.userHosts(options.user);
      if (!options.host && hosts.length > 1)
        throw new Error(
          `[ssh] user '${options.user}' is registered for several hosts ` +
            `(${hosts.map((entry) => entry.host).join(', ')}); the caller must name one`,
        );

      const registered = Underpost.ssh.resolveConnection({
        user: options.user,
        host: options.host || hosts[0]?.host,
      });

      if (!registered && options.host)
        throw new Error(
          `[ssh] no connection is registered for '${options.user}@${options.host}' in ${USERS_CONF_PATH}; ` +
            `run: node bin ssh --user ${options.user} --host ${options.host} --user-add`,
        );

      const connection =
        registered ||
        (process.env.DEFAULT_SSH_USER && process.env.DEFAULT_SSH_HOST && process.env.DEFAULT_SSH_KEY_PATH
          ? {
              user: process.env.DEFAULT_SSH_USER,
              host: process.env.DEFAULT_SSH_HOST,
              keyPath: process.env.DEFAULT_SSH_KEY_PATH,
              port: process.env.DEFAULT_SSH_PORT || DEFAULT_SSH_PORT,
            }
          : undefined);

      if (!connection) {
        logger.warn(`No SSH credentials for '${options.user}'`, {
          host: options.host || '(unspecified)',
          registry: USERS_CONF_PATH,
        });
        return;
      }
      if (!registered) logger.warn(`Using the deploy environment DEFAULT_SSH_* values`, { requested: options.user });

      Underpost.env.set('DEFAULT_SSH_USER', connection.user);
      Underpost.env.set('DEFAULT_SSH_HOST', connection.host);
      Underpost.env.set('DEFAULT_SSH_KEY_PATH', connection.keyPath);
      Underpost.env.set('DEFAULT_SSH_PORT', connection.port);
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
      const sshDirectory = `${Underpost.ssh.getUserHome(user)}/.ssh`;
      shellExec(`sudo chmod 700 ${shellArgumentFactory(sshDirectory)}`);
      shellExec(
        `if [ -f ${shellArgumentFactory(`${sshDirectory}/authorized_keys`)} ]; then sudo chmod 600 ${shellArgumentFactory(`${sshDirectory}/authorized_keys`)}; fi`,
      );
      shellExec(
        `if [ -f ${shellArgumentFactory(`${sshDirectory}/known_hosts`)} ]; then sudo chmod 644 ${shellArgumentFactory(`${sshDirectory}/known_hosts`)}; fi`,
      );
      shellExec(
        `if [ -f ${shellArgumentFactory(`${sshDirectory}/id_rsa`)} ]; then sudo chmod 600 ${shellArgumentFactory(`${sshDirectory}/id_rsa`)}; fi`,
      );
      shellExec(`sudo chmod 600 /etc/ssh/ssh_host_ed25519_key`);
      shellExec(`sudo chown -R ${shellArgumentFactory(`${user}:${user}`)} ${shellArgumentFactory(sshDirectory)}`);
      runSELinuxCommands(
        [
          ...selinuxSshContextCommandsFactory({ sshDirectory }),
          selinuxRestoreconCommandFactory('/etc/ssh/ssh_host_ed25519_key', { recursive: false }),
        ],
        { execute: shellExec },
      );
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
     * - Allows key-only root login
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
      const sshPort = Number(port || 22);
      const portCommands = selinuxSshPortCommandsFactory({ port: sshPort });
      const temporaryPath = `/tmp/underpost-sshd-config-${process.pid}`;
      const configuration = `Port ${sshPort}
HostKey /etc/ssh/ssh_host_ed25519_key
SyslogFacility AUTHPRIV
LogLevel VERBOSE
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin prohibit-password
StrictModes yes
MaxAuthTries 3
LoginGraceTime 60
UsePAM yes
ClientAliveInterval 300
ClientAliveCountMax 0
X11Forwarding no
UseDNS no
PermitTunnel no
AllowTcpForwarding no
Include /etc/ssh/sshd_config.d/*.conf
Subsystem sftp /usr/libexec/openssh/sftp-server
`;

      fs.writeFileSync(temporaryPath, configuration, { mode: 0o600 });
      try {
        if (sshPort !== 22) {
          shellExec(
            `if command -v dnf >/dev/null 2>&1 && ! command -v semanage >/dev/null 2>&1; then ${selinuxPackagesCommandFactory()}; fi`,
          );
        }
        runSELinuxCommands(portCommands, { execute: shellExec });
        shellExec(`sudo ssh-keygen -A`);
        shellExec(`sudo /usr/sbin/sshd -t -f ${shellArgumentFactory(temporaryPath)}`);
        shellExec(`sudo install -m 0600 -o root -g root ${shellArgumentFactory(temporaryPath)} /etc/ssh/sshd_config`);
        runSELinuxCommands(
          [selinuxRestoreconCommandFactory(['/etc/ssh/sshd_config', '/etc/ssh/ssh_host_ed25519_key'])],
          { execute: shellExec },
        );
        if (sshPort !== 22) {
          shellExec(
            `if command -v firewall-cmd >/dev/null 2>&1 && sudo firewall-cmd --state >/dev/null 2>&1; then sudo firewall-cmd --permanent --add-port=${sshPort}/tcp && sudo firewall-cmd --reload; fi`,
          );
        }
        shellExec(`sudo systemctl enable sshd`);
        shellExec(`sudo systemctl restart sshd`);
      } finally {
        fs.removeSync(temporaryPath);
      }

      const status = shellExec(`sudo systemctl status sshd`, { silent: true, stdout: true });
      if (status.match('running')) console.log(status.replaceAll(`running`, `running`.green));
      else {
        logger.error('SSHD service failed to start');
        console.log(status);
      }
    },
  };
}

export { connectionFactory, hostNameFactory, upsertConnection, userRecordFactory };

export default UnderpostSSH;
