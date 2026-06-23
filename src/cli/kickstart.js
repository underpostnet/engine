/**
 * Kickstart configuration generator for Underpost Engine
 * @module src/cli/kickstart.js
 * @namespace UnderpostKickStart
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loggerFactory } from '../server/logger.js';

const logger = loggerFactory(import.meta);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UnderpostKickStart {
  static API = {
    /**
     * @method kickstartHeader
     * @description Generates the kickstart header section with template variables.
     * @param {object} options
     * @param {string} [options.lang='en_US.UTF-8']
     * @param {string} [options.keyboard='us']
     * @param {string} [options.timezone='America/New_York']
     * @param {string} [options.rootPassword]
     * @memberof UnderpostKickStart
     * @returns {string}
     */
    kickstartHeader: ({ lang = 'en_US.UTF-8', keyboard = 'us', timezone = 'America/New_York', rootPassword = '' }) => {
      return [
        '# Rocky Linux 9 Kickstart - Ephemeral Anaconda Live Environment with SSHD',
        'cmdline',
        'eula --agreed',
        `keyboard --vckeymap=${keyboard} --xlayouts='${keyboard}'`,
        `lang ${lang}`,
        'network --bootproto=dhcp --device=link --activate --onboot=yes',
        `timezone ${timezone} --utc`,
        rootPassword ? `rootpw --plaintext ${rootPassword}` : 'rootpw --lock',
        'firstboot --disable',
        'skipx',
      ].join('\n');
    },

    /**
     * @method kickstartPreVariables
     * @description Generates the shell variable-assignment block injected at the top of the
     * kickstart `%pre` script. These variables drive both the ephemeral commissioning runtime
     * and the unattended disk installer in `scripts/rocky-kickstart.sh`. Passwords are emitted
     * base64-encoded (`*_B64`) and decoded by an in-script `ks_b64d` helper; all other values
     * are single-quote escaped so arbitrary content survives the shell/heredoc layers.
     * @param {object} options - Variable values to bake into the `%pre` block.
     * @param {string} [options.rootPassword=''] - root console password (base64-encoded).
     * @param {string} [options.authorizedKeys=''] - SSH public key(s) installed as authorized_keys.
     * @param {string} [options.adminUsername=''] - Primary (MAAS) admin user (defaults to MAAS_ADMIN_USERNAME).
     * @param {string} [options.adminPassword=''] - Primary admin console password (defaults to rootPassword).
     * @param {string} [options.deployUsername=''] - Optional second (deploy) admin user (e.g. admin).
     * @param {string} [options.deployPassword=''] - Deploy user console password (defaults to rootPassword).
     * @param {string} [options.netIp=''] - Static IPv4 for the deployed OS; empty = DHCP.
     * @param {number} [options.netPrefix=24] - IPv4 prefix length for the static address.
     * @param {string} [options.netGateway=''] - Default gateway for the deployed OS.
     * @param {string} [options.netDns=''] - DNS server for the deployed OS.
     * @param {string} [options.timezone=''] - IANA timezone configured in the deployed OS (e.g. America/Santiago).
     * @param {string} [options.keyboardLayout=''] - Console/X11 keyboard layout for the deployed OS (e.g. es).
     * @param {string} [options.chronyConfPath='/etc/chrony.conf'] - chrony config path written in the deployed OS.
     * @param {string} [options.bootstrapUrl=''] - Base URL of the bootstrap HTTP server for this host (status POSTs).
     * @param {string} [options.workflowId=''] - Workflow identifier reported in status metadata.
     * @param {string} [options.systemId=''] - MAAS system id reported in status metadata (if known).
     * @param {string} [options.targetHostname=''] - Hostname reported in status metadata and set on the deployed OS.
     * @param {number} [options.sshPort=22] - SSH port the ephemeral runtime listens on.
     * @param {string} [options.installDiskHint=''] - Optional explicit target disk (e.g. /dev/nvme0n1); empty = auto-detect.
     * @param {boolean} [options.autoInstall=true] - When true, the ephemeral runtime self-installs after a fallback timeout if no remote trigger arrives.
     * @memberof UnderpostKickStart
     * @returns {string} Newline-joined bash variable assignments.
     */
    kickstartPreVariables: ({
      rootPassword = '',
      authorizedKeys = '',
      adminUsername = '',
      adminPassword = '',
      deployUsername = '',
      deployPassword = '',
      netIp = '',
      netPrefix = 24,
      netGateway = '',
      netDns = '',
      timezone = '',
      keyboardLayout = '',
      chronyConfPath = '/etc/chrony.conf',
      bootstrapUrl = '',
      workflowId = '',
      systemId = '',
      targetHostname = '',
      sshPort = 22,
      installDiskHint = '',
      autoInstall = true,
    }) => {
      const sanitizedKeys = (authorizedKeys || '').trim();
      // Passwords are passed base64-encoded so arbitrary characters (quotes,
      // spaces, $, etc.) survive every shell/heredoc layer intact. base64 output
      // never contains single quotes. Decoding tries `base64` then falls back to
      // python3 so a minimal Anaconda environment can never yield empty passwords.
      const b64 = (v) => Buffer.from(String(v || ''), 'utf8').toString('base64');
      const sq = (v) => `'${String(v || '').replace(/'/g, "'\\''")}'`;
      return [
        `ks_b64d() { printf %s "$1" | base64 -d 2>/dev/null || printf %s "$1" | python3 -c 'import sys,base64;sys.stdout.buffer.write(base64.b64decode(sys.stdin.read().strip()))' 2>/dev/null; }`,
        `ROOT_PASS_B64='${b64(rootPassword)}'`,
        `ADMIN_PASS_B64='${b64(adminPassword || rootPassword)}'`,
        `DEPLOY_PASS_B64='${b64(deployPassword)}'`,
        `ROOT_PASS="$(ks_b64d "$ROOT_PASS_B64")"`,
        `ADMIN_PASS="$(ks_b64d "$ADMIN_PASS_B64")"`,
        `DEPLOY_PASS="$(ks_b64d "$DEPLOY_PASS_B64")"`,
        `AUTHORIZED_KEYS=${sq(sanitizedKeys)}`,
        `ADMIN_USER=${sq(adminUsername || process.env.MAAS_ADMIN_USERNAME || 'maas')}`,
        `DEPLOY_USER=${sq(deployUsername)}`,
        `NET_IP=${sq(netIp)}`,
        `NET_PREFIX='${parseInt(netPrefix, 10) || 24}'`,
        `NET_GATEWAY=${sq(netGateway)}`,
        `NET_DNS=${sq(netDns)}`,
        `TIMEZONE=${sq(timezone)}`,
        `KEYBOARD_LAYOUT=${sq(keyboardLayout)}`,
        `CHRONY_CONF_PATH=${sq(chronyConfPath || '/etc/chrony.conf')}`,
        `BOOTSTRAP_URL=${sq(bootstrapUrl)}`,
        `WORKFLOW_ID=${sq(workflowId)}`,
        `SYSTEM_ID=${sq(systemId)}`,
        `TARGET_HOSTNAME=${sq(targetHostname)}`,
        `SSH_PORT='${sshPort || 22}'`,
        `INSTALL_DISK_HINT=${sq(installDiskHint)}`,
        `AUTO_INSTALL='${autoInstall ? '1' : '0'}'`,
      ].join('\n');
    },

    /**
     * @method kickstartFactory
     * @description Generates a complete kickstart configuration by combining the header,
     * the `%pre` variable-assignment block, and the `scripts/rocky-kickstart.sh` body.
     * @param {object} options - Kickstart generation options.
     * @param {string} [options.lang='en_US.UTF-8'] - System language for the ephemeral runtime.
     * @param {string} [options.keyboard='us'] - Keyboard layout for the ephemeral runtime AND the deployed OS.
     * @param {string} [options.timezone='America/New_York'] - Timezone for the ephemeral runtime AND the deployed OS.
     * @param {string} [options.chronyConfPath='/etc/chrony.conf'] - chrony config path written in the deployed OS.
     * @param {string} [options.rootPassword=process.env.MAAS_ADMIN_PASS] - root console password.
     * @param {string} [options.adminUsername=''] - Primary (MAAS) admin user created in the deployed OS.
     * @param {string} [options.adminPassword=''] - Primary admin console password (defaults to rootPassword).
     * @param {string} [options.deployUsername=''] - Optional second (deploy) admin user (e.g. admin).
     * @param {string} [options.deployPassword=''] - Deploy user console password (defaults to rootPassword).
     * @param {string} [options.netIp=''] - Static IPv4 for the deployed OS; empty = DHCP.
     * @param {number} [options.netPrefix=24] - IPv4 prefix length for the static address.
     * @param {string} [options.netGateway=''] - Default gateway for the deployed OS.
     * @param {string} [options.netDns=''] - DNS server for the deployed OS.
     * @param {string} [options.authorizedKeys=''] - SSH public key(s) installed as authorized_keys.
     * @param {string} [options.bootstrapUrl=''] - Base URL of the bootstrap HTTP server (status POSTs).
     * @param {string} [options.workflowId=''] - Workflow identifier reported in status metadata.
     * @param {string} [options.systemId=''] - MAAS system id reported in status metadata (if known).
     * @param {string} [options.targetHostname=''] - Hostname reported in status metadata and set on the deployed OS.
     * @param {number} [options.sshPort=22] - SSH port the ephemeral runtime listens on.
     * @param {string} [options.installDiskHint=''] - Optional explicit target disk; empty = auto-detect.
     * @param {boolean} [options.autoInstall=true] - When true, the runtime self-installs after a fallback timeout.
     * @memberof UnderpostKickStart
     * @returns {string} The full kickstart (ks.cfg) source.
     */
    kickstartFactory: ({
      lang = 'en_US.UTF-8',
      keyboard = 'us',
      timezone = 'America/New_York',
      chronyConfPath = '/etc/chrony.conf',
      rootPassword = process.env.MAAS_ADMIN_PASS,
      adminUsername = '',
      adminPassword = '',
      deployUsername = '',
      deployPassword = '',
      netIp = '',
      netPrefix = 24,
      netGateway = '',
      netDns = '',
      authorizedKeys = '',
      bootstrapUrl = '',
      workflowId = '',
      systemId = '',
      targetHostname = '',
      sshPort = 22,
      installDiskHint = '',
      autoInstall = true,
    }) => {
      const resolvedAdminUsername = adminUsername || process.env.MAAS_ADMIN_USERNAME || 'maas';
      const header = UnderpostKickStart.API.kickstartHeader({ lang, keyboard, timezone, rootPassword });
      const variables = UnderpostKickStart.API.kickstartPreVariables({
        rootPassword,
        authorizedKeys,
        adminUsername: resolvedAdminUsername,
        adminPassword,
        deployUsername,
        deployPassword,
        netIp,
        netPrefix,
        netGateway,
        netDns,
        timezone,
        keyboardLayout: keyboard,
        chronyConfPath,
        bootstrapUrl,
        workflowId,
        systemId,
        targetHostname,
        sshPort,
        installDiskHint,
        autoInstall,
      });

      const scriptPath = path.resolve(__dirname, '../../scripts/rocky-kickstart.sh');
      const scriptBody = fs.readFileSync(scriptPath, 'utf8');

      return [
        header,
        '',
        '%pre --interpreter=/bin/bash --log=/tmp/ks-pre.log --erroronfail',
        '#!/bin/bash',
        variables,
        '',
        scriptBody,
        '%end',
      ].join('\n');
    },

    /**
     * @method kernelParamsFactory
     * @description Appends kickstart-specific kernel parameters (inst.ks, inst.repo, inst.text, inst.sshd).
     * @param {string} macAddress - The MAC address of the target machine.
     * @param {array} cmd - The existing array of kernel parameters.
     * @param {object} options - Options for generating kernel parameters.
     * @param {string} options.ipDhcpServer - The IP address of the DHCP server.
     * @param {number} [options.bootstrapHttpServerPort=8888] - Port for the bootstrap HTTP server.
     * @param {string} options.hostname - The hostname of the target machine.
     * @param {string} [options.architecture='amd64'] - The target architecture.
     * @memberof UnderpostKickStart
     * @returns {array}
     */
    kernelParamsFactory(
      macAddress,
      cmd = [],
      options = { ipDhcpServer: '', bootstrapHttpServerPort: 8888, hostname: '', architecture: 'amd64' },
    ) {
      const { ipDhcpServer, bootstrapHttpServerPort, hostname, architecture } = options;
      const repoArch = architecture && architecture.match('arm64') ? 'aarch64' : 'x86_64';
      return cmd.concat([
        `inst.ks=http://${ipDhcpServer}:${bootstrapHttpServerPort}/${hostname}/ks.cfg`,
        `inst.repo=http://dl.rockylinux.org/pub/rocky/9/BaseOS/${repoArch}/os/`,
        `inst.text`,
        `inst.sshd`,
      ]);
    },

    /**
     * @method httpServerStaticFactory
     * @description Writes kickstart ks.cfg file to the bootstrap HTTP server path.
     * @param {object} params
     * @param {string} params.bootstrapHttpServerPath
     * @param {string} params.hostname
     * @param {string} params.kickstartSrc
     * @memberof UnderpostKickStart
     * @returns {void}
     */
    httpServerStaticFactory({ bootstrapHttpServerPath, hostname, kickstartSrc }) {
      if (!kickstartSrc) return;
      const dest = `${bootstrapHttpServerPath}/${hostname}/ks.cfg`;
      fs.writeFileSync(dest, kickstartSrc, 'utf8');
      logger.info(`Kickstart file written to ${dest}`);
    },
  };
}

export default UnderpostKickStart;
