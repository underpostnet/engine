/**
 * Provides a comprehensive set of DNS and IP management utilities,
 * primarily focused on dynamic DNS (DDNS) updates and network checks.
 * @module src/server/dns.js
 * @namespace UnderpostDns
 */
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import validator from 'validator';
import { loggerFactory } from './logger.js';
import dns from 'node:dns';
import os from 'node:os';
import { shellExec, pbcopy } from './process.js';
import Underpost from '../index.js';
import { writeEnv } from './conf.js';
import { resolveDeployId } from './cron.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for handling DNS and IP related operations.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class Dns
 * @augments Dns
 * @memberof UnderpostDns
 */
class Dns {
  /**
   * Retrieves the current public IP address (IPv4 or IPv6).
   * @async
   * @static
   * @memberof UnderpostDns
   * @returns {Promise<string>} The public IP address.
   */
  static async getPublicIp() {
    return await new Promise(async (resolve) => {
      try {
        return axios
          .get(process.env.HTTP_PLAIN_IP_URL ? process.env.HTTP_PLAIN_IP_URL : 'https://api.ipify.org')
          .then((response) => resolve(response.data));
      } catch (error) {
        logger.error('Error fetching public IP:', { error: error.message, stack: error.stack });
        return resolve(null);
      }
    });
  }

  /**
   * Checks for active internet connection by performing a DNS lookup on a specified domain.
   * @static
   * @memberof UnderpostDns
   * @param {string} [domain='google.com'] The domain to check the connection against.
   * @returns {Promise<boolean>} True if connected, false otherwise.
   */
  static isInternetConnection(domain = 'google.com') {
    return new Promise((resolve) => dns.lookup(domain, {}, (err) => resolve(err ? false : true)));
  }

  /**
   * Determines the default network interface name using shell command.
   * This method is primarily intended for Linux environments.
   * @static
   * @memberof UnderpostDns
   * @returns {string} The default network interface name.
   * @memberof UnderpostDns
   */
  static getDefaultNetworkInterface() {
    return shellExec(`ip route | grep default | cut -d ' ' -f 5`, {
      stdout: true,
      silent: true,
      disableLog: true,
    }).trim();
  }

  /**
   * Gets the local device's IPv4 address by determining the active network interface.
   * This relies on shell execution (`ip route`) and is primarily intended for Linux environments.
   * @static
   * @memberof UnderpostDns
   * @returns {string} The local IPv4 address.
   */
  static getLocalIPv4Address() {
    // Determine the default network interface name using shell command
    const interfaceName = Dns.getDefaultNetworkInterface();

    // Find the IPv4 address associated with the determined interface
    const networkInfo = os.networkInterfaces()[interfaceName];

    if (!networkInfo) {
      logger.error(`Could not find network interface: ${interfaceName}`);
      return null;
    }

    const ipv4 = networkInfo.find((i) => i.family === 'IPv4');

    if (!ipv4) {
      logger.error(`Could not find IPv4 address for interface: ${interfaceName}`);
      return null;
    }

    return ipv4.address;
  }

  /**
   * Setup nftables tables and chains if they don't exist.
   * @static
   * @memberof UnderpostDns
   */
  static setupNftables() {
    shellExec(`sudo nft add table inet filter 2>/dev/null`, { silent: true });
    shellExec(
      `sudo nft add chain inet filter input '{ type filter hook input priority 0; policy accept; }' 2>/dev/null`,
      { silent: true },
    );
    shellExec(
      `sudo nft add chain inet filter output '{ type filter hook output priority 0; policy accept; }' 2>/dev/null`,
      { silent: true },
    );
    shellExec(
      `sudo nft add chain inet filter forward '{ type filter hook forward priority 0; policy accept; }' 2>/dev/null`,
      { silent: true },
    );
  }

  /**
   * Bans an IP address from ingress traffic.
   * @static
   * @memberof UnderpostDns
   * @param {string} ip - The IP address to ban.
   */
  static banIngress(ip) {
    Dns.setupNftables();
    if (!validator.isIP(ip)) {
      logger.error(`Invalid IP address: ${ip}`);
      return;
    }
    shellExec(`sudo nft add rule inet filter input ip saddr ${ip} counter drop`, { silent: true });
    logger.info(`Banned ingress for IP: ${ip}`);
  }

  /**
   * Bans an IP address from egress traffic.
   * @static
   * @memberof UnderpostDns
   * @param {string} ip - The IP address to ban.
   */
  static banEgress(ip) {
    Dns.setupNftables();
    if (!validator.isIP(ip)) {
      logger.error(`Invalid IP address: ${ip}`);
      return;
    }
    shellExec(`sudo nft add rule inet filter output ip daddr ${ip} counter drop`, { silent: true });
    shellExec(`sudo nft add rule inet filter forward ip daddr ${ip} counter drop`, { silent: true });
    logger.info(`Banned egress for IP: ${ip}`);
  }

  /**
   * Helper to get nftables rule handles for a specific IP and chain.
   * @static
   * @memberof UnderpostDns
   * @param {string} chain - The chain name (input, output, forward).
   * @param {string} ip - The IP address.
   * @param {string} type - The type (saddr or daddr).
   * @returns {string[]} Array of handles.
   */
  static getNftHandles(chain, ip, type) {
    const output = shellExec(`sudo nft -a list chain inet filter ${chain}`, { stdout: true, silent: true });
    const lines = output.split('\n');
    const handles = [];
    // Regex to match IP and handle. Note: output format depends on nft version but usually contains "handle <id>" at end.
    // Example: ip saddr 1.2.3.4 counter packets 0 bytes 0 drop # handle 5
    const regex = new RegExp(`ip ${type} ${ip} .* handle (\\d+)`);
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        handles.push(match[1]);
      }
    }
    return handles;
  }

  /**
   * Unbans an IP address from ingress traffic.
   * @static
   * @memberof UnderpostDns
   * @param {string} ip - The IP address to unban.
   */
  static unbanIngress(ip) {
    const handles = Dns.getNftHandles('input', ip, 'saddr');
    for (const handle of handles) {
      shellExec(`sudo nft delete rule inet filter input handle ${handle}`, { silent: true });
    }
    logger.info(`Unbanned ingress for IP: ${ip}`);
  }

  /**
   * Unbans an IP address from egress traffic.
   * @static
   * @memberof UnderpostDns
   * @param {string} ip - The IP address to unban.
   */
  static unbanEgress(ip) {
    const outputHandles = Dns.getNftHandles('output', ip, 'daddr');
    for (const handle of outputHandles) {
      shellExec(`sudo nft delete rule inet filter output handle ${handle}`, { silent: true });
    }
    const forwardHandles = Dns.getNftHandles('forward', ip, 'daddr');
    for (const handle of forwardHandles) {
      shellExec(`sudo nft delete rule inet filter forward handle ${handle}`, { silent: true });
    }
    logger.info(`Unbanned egress for IP: ${ip}`);
  }

  /**
   * Lists all banned ingress IPs.
   * @static
   * @memberof UnderpostDns
   */
  static listBannedIngress() {
    const output = shellExec(`sudo nft list chain inet filter input`, { stdout: true, silent: true });
    console.log(output);
  }

  /**
   * Lists all banned egress IPs.
   * @static
   * @memberof UnderpostDns
   */
  static listBannedEgress() {
    console.log('--- Output Chain ---');
    console.log(shellExec(`sudo nft list chain inet filter output`, { stdout: true, silent: true }));
    console.log('--- Forward Chain ---');
    console.log(shellExec(`sudo nft list chain inet filter forward`, { stdout: true, silent: true }));
  }

  /**
   * Clears all banned ingress IPs.
   * @static
   * @memberof UnderpostDns
   */
  static clearBannedIngress() {
    shellExec(`sudo nft flush chain inet filter input`, { silent: true });
    logger.info('Cleared all ingress bans.');
  }

  /**
   * Clears all banned egress IPs.
   * @static
   * @memberof UnderpostDns
   */
  static clearBannedEgress() {
    shellExec(`sudo nft flush chain inet filter output`, { silent: true });
    shellExec(`sudo nft flush chain inet filter forward`, { silent: true });
    logger.info('Cleared all egress bans.');
  }

  /**
   * Performs the dynamic DNS update logic.
   * It checks if the public IP has changed and, if so, updates the configured DNS records.
   * @async
   * @static
   * @memberof UnderpostDns
   * @param {string} deployList Comma-separated string of deployment IDs to process.
   * @returns {Promise<void>}
   */
  static async callback(deployList) {
    const isOnline = await Dns.isInternetConnection();

    if (!isOnline) return;

    let testIp;

    try {
      testIp = await Dns.getPublicIp();
    } catch (error) {
      logger.error(error, { testIp, stack: error.stack });
    }

    const currentIp = Underpost.env.get('ip');

    if (validator.isIP(testIp) && currentIp !== testIp) {
      logger.info(`New IP detected`, testIp);
      Underpost.env.set('monitor-input', 'pause');

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        const privateCronConfPath = `./engine-private/conf/${deployId}/conf.cron.json`;
        const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

        if (!fs.existsSync(confCronPath)) {
          logger.warn(`Cron config file not found for deployId: ${deployId} at ${confCronPath}`);
          continue;
        }

        const confCronData = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

        if (!confCronData.records) {
          logger.warn(`'records' field missing in cron config for deployId: ${deployId}`);
          continue;
        }

        // Iterate through DNS record types (A, AAAA, etc.)
        for (const recordType of Object.keys(confCronData.records)) {
          switch (recordType) {
            case 'A':
              // Process A records for IPv4 update
              for (const dnsProvider of confCronData.records[recordType]) {
                if (typeof Dns.services.updateIp[dnsProvider.dns] === 'function')
                  await Dns.services.updateIp[dnsProvider.dns]({ ...dnsProvider, ip: testIp });
              }
              break;

            // Add other record types (e.g., AAAA) here if needed
            default:
              break;
          }
        }

        // Verify the IP update externally
        try {
          const ipUrlTest = `https://${process.env.DEFAULT_DEPLOY_HOST}`;
          const response = await axios.get(ipUrlTest);
          const verifyIp = response.request.socket.remoteAddress;
          logger.info(ipUrlTest + ' verify ip', verifyIp);
          if (verifyIp === testIp) {
            logger.info('IP updated successfully and verified', testIp);
            Underpost.env.set('ip', testIp);
            Underpost.env.delete('monitor-input');
          } else {
            logger.error('IP not updated or verification failed', { expected: testIp, received: verifyIp });
          }
        } catch (error) {
          logger.error('Error during IP update verification step', {
            error: error.message,
            stack: error.stack,
            testIp,
          });
        }
      }
    }
  }

  /**
   * Internal collection of external DNS service update functions.
   * @static
   * @memberof UnderpostDns
   * @property {object} updateIp - Functions keyed by DNS provider name to update A/AAAA records.
   */
  static services = {
    updateIp: {
      /**
       * Updates the IP address for a dondominio.com DNS record.
       * @memberof UnderpostDns
       * @param {object} options
       * @param {string} options.user - The dondominio DDNS username.
       * @param {string} options.api_key - The dondominio DDNS password/API key.
       * @param {string} options.host - The hostname to update.
       * @param {string} options.dns - The name of the DNS provider ('dondominio').
       * @param {string} options.ip - The new IPv4 address to set.
       * @returns {Promise<boolean>} True on success, false on failure.
       */
      dondominio: (options) => {
        const { user, api_key, host, dns, ip } = options;
        const url = `https://dondns.dondominio.com/json/?user=${user}&password=${api_key}&host=${host}&ip=${ip}`;
        logger.info(`${dns} update ip url`, url);

        // Prevent live IP update in non-production environments
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('Skipping dondominio update in non-production environment.');
          return Promise.resolve(false);
        }

        return new Promise((resolve) => {
          axios
            .get(url)
            .then((response) => {
              logger.info(`${dns} update ip success`, response.data);
              return resolve(true);
            })
            .catch((error) => {
              logger.error(error, `${dns} update ip error: ${error.message}`);
              return resolve(false);
            });
        });
      },
      // Add other DNS provider update functions here
    },
  };

  /**
   * Dispatcher for IP ban/unban/list/clear operations based on CLI options.
   * @static
   * @memberof UnderpostDns
   * @param {string} [ips=''] Comma-separated string of IPs to process.
   * @param {object} options - Options indicating which action to perform.
   * @property {boolean} [options.banIngressAdd=false] - Ban IPs from ingress.
   * @property {boolean} [options.banIngressRemove=false] - Unban IPs from ingress.
   * @property {boolean} [options.banIngressList=false] - List banned ingress IPs.
   * @property {boolean} [options.banIngressClear=false] - Clear all banned ingress IPs.
   * @property {boolean} [options.banEgressAdd=false] - Ban IPs from egress.
   * @property {boolean} [options.banEgressRemove=false] - Unban IPs from egress.
   * @property {boolean} [options.banEgressList=false] - List banned egress IPs.
   * @property {boolean} [options.banEgressClear=false] - Clear all banned egress IPs.
   * @property {boolean} [options.banBothAdd=false] - Ban IPs from both ingress and egress.
   * @property {boolean} [options.banBothRemove=false] - Unban IPs from both ingress and egress.
   * @property {boolean} [options.dhcp=false] - Get local DHCP IP instead of public IP.
   * @property {boolean} [options.copy=false] - Copy the public IP to clipboard.
   * @return {Promise<string|void>} The public IP if no ban/unban action is taken.
   */
  static async ipDispatcher(
    ips = '',
    options = {
      banIngressAdd: false,
      banIngressRemove: false,
      banIngressList: false,
      banIngressClear: false,
      banEgressAdd: false,
      banEgressRemove: false,
      banEgressList: false,
      banEgressClear: false,
      banBothAdd: false,
      banBothRemove: false,
      copy: false,
      dhcp: false,
    },
  ) {
    const ipList = ips
      ? ips
          .split(',')
          .map((i) => i.trim())
          .filter(Boolean)
      : [];

    if (options.banIngressAdd) {
      return ipList.forEach((ip) => Dns.banIngress(ip));
    }
    if (options.banIngressRemove) {
      return ipList.forEach((ip) => Dns.unbanIngress(ip));
    }
    if (options.banIngressList) {
      return Dns.listBannedIngress();
    }
    if (options.banIngressClear) {
      return Dns.clearBannedIngress();
    }

    if (options.banEgressAdd) {
      return ipList.forEach((ip) => Dns.banEgress(ip));
    }
    if (options.banEgressRemove) {
      return ipList.forEach((ip) => Dns.unbanEgress(ip));
    }
    if (options.banEgressList) {
      return Dns.listBannedEgress();
    }
    if (options.banEgressClear) {
      return Dns.clearBannedEgress();
    }

    if (options.banBothAdd) {
      return ipList.forEach((ip) => {
        Dns.banIngress(ip);
        Dns.banEgress(ip);
      });
    }
    if (options.banBothRemove) {
      return ipList.forEach((ip) => {
        Dns.unbanIngress(ip);
        Dns.unbanEgress(ip);
      });
    }

    let ip;
    if (options.dhcp) ip = Dns.getLocalIPv4Address();
    else ip = await Dns.getPublicIp();
    if (options.copy) return pbcopy(ip);
    console.log(ip);
    return ip;
  }
}

/**
 * @function isInternetConnection
 * @memberof UnderpostDns
 * @description Exported function for backward compatibility.
 * @param {string} [domain='google.com']
 * @returns {Promise<boolean>}
 */
const isInternetConnection = Dns.isInternetConnection;

/**
 * @function getLocalIPv4Address
 * @memberof UnderpostDns
 * @description Exported function for backward compatibility.
 * @returns {string}
 */
const getLocalIPv4Address = Dns.getLocalIPv4Address;

/**
 * Main UnderpostDns class exposing the Dns API.
 * @class UnderpostDns
 * @memberof UnderpostDns
 */
class UnderpostDns {
  static API = Dns;
}

export default UnderpostDns;

export { Dns, isInternetConnection, getLocalIPv4Address, UnderpostDns };
