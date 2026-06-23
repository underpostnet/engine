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
     * @description Generates the variable assignments block for the %pre script.
     * @param {object} options
     * @param {string} [options.rootPassword]
     * @param {string} [options.authorizedKeys]
     * @param {string} [options.adminUsername]
     * @param {string} [options.bootstrapUrl] - Base URL of the bootstrap HTTP server for this host (status POSTs).
     * @param {string} [options.workflowId] - Workflow identifier reported in status metadata.
     * @param {string} [options.systemId] - MAAS system id reported in status metadata (if known).
     * @param {string} [options.targetHostname] - Hostname reported in status metadata.
     * @param {number} [options.sshPort] - SSH port the ephemeral runtime listens on.
     * @param {string} [options.installDiskHint] - Optional explicit target disk (e.g. /dev/nvme0n1); empty = auto-detect.
     * @param {boolean} [options.autoInstall] - When true, the ephemeral runtime self-installs after a fallback timeout if no remote trigger arrives.
     * @memberof UnderpostKickStart
     * @returns {string}
     */
    kickstartPreVariables: ({
      rootPassword = '',
      authorizedKeys = '',
      adminUsername = '',
      adminPassword = '',
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
      // spaces, $, etc.) survive every shell/heredoc layer intact, then decoded
      // once here. base64 output never contains single quotes.
      const b64 = (v) => Buffer.from(String(v || ''), 'utf8').toString('base64');
      const sq = (v) => `'${String(v || '').replace(/'/g, "'\\''")}'`;
      return [
        `ROOT_PASS_B64='${b64(rootPassword)}'`,
        `ADMIN_PASS_B64='${b64(adminPassword || rootPassword)}'`,
        `ROOT_PASS="$(printf %s "$ROOT_PASS_B64" | base64 -d 2>/dev/null)"`,
        `ADMIN_PASS="$(printf %s "$ADMIN_PASS_B64" | base64 -d 2>/dev/null)"`,
        `AUTHORIZED_KEYS=${sq(sanitizedKeys)}`,
        `ADMIN_USER=${sq(adminUsername || process.env.MAAS_ADMIN_USERNAME || 'maas')}`,
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
     * variable assignments, and the rocky-kickstart.sh script body.
     * @param {object} options
     * @param {string} [options.lang='en_US.UTF-8']
     * @param {string} [options.keyboard='us']
     * @param {string} [options.timezone='America/New_York']
     * @param {string} [options.rootPassword]
     * @param {string} [options.adminUsername] - Admin user created in the installed OS (defaults to MAAS_ADMIN_USERNAME).
     * @param {string} [options.adminPassword] - Admin user console password (defaults to rootPassword).
     * @param {string} [options.authorizedKeys]
     * @param {string} [options.bootstrapUrl]
     * @param {string} [options.workflowId]
     * @param {string} [options.systemId]
     * @param {string} [options.targetHostname]
     * @param {number} [options.sshPort]
     * @param {string} [options.installDiskHint]
     * @param {boolean} [options.autoInstall]
     * @memberof UnderpostKickStart
     * @returns {string}
     */
    kickstartFactory: ({
      lang = 'en_US.UTF-8',
      keyboard = 'us',
      timezone = 'America/New_York',
      rootPassword = process.env.MAAS_ADMIN_PASS,
      adminUsername = '',
      adminPassword = '',
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
