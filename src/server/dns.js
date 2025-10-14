/**
 * Provides a comprehensive set of DNS and IP management utilities,
 * primarily focused on dynamic DNS (DDNS) updates and network checks.
 * @module src/server/dns.js
 * @namespace DnsManager
 */
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import validator from 'validator';
import { publicIp, publicIpv4, publicIpv6 } from 'public-ip';
import { loggerFactory } from './logger.js';
import UnderpostRootEnv from '../cli/env.js';
import dns from 'node:dns';
import os from 'node:os';
import { shellExec } from './process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

/**
 * Main class for handling DNS and IP related operations.
 * All utility methods are implemented as static to serve as a namespace container.
 * @class Dns
 * @augments Dns
 * @memberof DnsManager
 */
class Dns {
  /**
   * Retrieves the current public IP address (IPv4 or IPv6).
   * @async
   * @static
   * @memberof DnsManager
   * @returns {Promise<string>} The public IP address.
   */
  static async getPublicIp() {
    return await publicIp();
  }

  /**
   * Retrieves the current public IPv4 address.
   * @async
   * @static
   * @memberof DnsManager
   * @returns {Promise<string>} The public IPv4 address.
   */
  static async getPublicIpv4() {
    return await publicIpv4();
  }

  /**
   * Retrieves the current public IPv6 address.
   * @async
   * @static
   * @memberof DnsManager
   * @returns {Promise<string>} The public IPv6 address.
   */
  static async getPublicIpv6() {
    return await publicIpv6();
  }

  /**
   * Checks for active internet connection by performing a DNS lookup on a specified domain.
   * @static
   * @memberof DnsManager
   * @param {string} [domain='google.com'] The domain to check the connection against.
   * @returns {Promise<boolean>} True if connected, false otherwise.
   */
  static isInternetConnection(domain = 'google.com') {
    return new Promise((resolve) => dns.lookup(domain, {}, (err) => resolve(err ? false : true)));
  }

  /**
   * Gets the local device's IPv4 address by determining the active network interface.
   * This relies on shell execution (`ip route`) and is primarily intended for Linux environments.
   * @static
   * @memberof DnsManager
   * @returns {string} The local IPv4 address.
   */
  static getLocalIPv4Address() {
    // Determine the default network interface name using shell command
    const interfaceName = shellExec(`ip route | grep default | cut -d ' ' -f 5`, {
      stdout: true,
      silent: true,
      disableLog: true,
    }).trim();

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
   * Performs the dynamic DNS update logic.
   * It checks if the public IP has changed and, if so, updates the configured DNS records.
   * @async
   * @static
   * @memberof DnsManager
   * @param {string} deployList Comma-separated string of deployment IDs to process.
   * @returns {Promise<void>}
   */
  static async callback(deployList) {
    const isOnline = await Dns.isInternetConnection();

    if (!isOnline) return;

    let testIp;

    try {
      testIp = await Dns.getPublicIpv4();
    } catch (error) {
      logger.error(error, { testIp, stack: error.stack });
    }

    const currentIp = UnderpostRootEnv.API.get('ip');

    if (validator.isIP(testIp) && currentIp !== testIp) {
      logger.info(`New IP detected`, testIp);
      UnderpostRootEnv.API.set('monitor-input', 'pause');

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
            UnderpostRootEnv.API.set('ip', testIp);
            UnderpostRootEnv.API.delete('monitor-input');
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
   * @memberof DnsManager
   * @property {object} updateIp - Functions keyed by DNS provider name to update A/AAAA records.
   */
  static services = {
    updateIp: {
      /**
       * Updates the IP address for a dondominio.com DNS record.
       * @memberof DnsManager
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
}

/**
 * @namespace Dns
 * @description Exported IP object for backward compatibility, mapping to Dns static methods.
 */
const ip = {
  public: {
    /** @type {function(): Promise<string>} */
    get: Dns.getPublicIp,
    /** @type {function(): Promise<string>} */
    ipv4: Dns.getPublicIpv4,
    /** @type {function(): Promise<string>} */
    ipv6: Dns.getPublicIpv6,
  },
};

/**
 * @function isInternetConnection
 * @memberof DnsManager
 * @description Exported function for backward compatibility.
 * @param {string} [domain='google.com']
 * @returns {Promise<boolean>}
 */
const isInternetConnection = Dns.isInternetConnection;

/**
 * @function getLocalIPv4Address
 * @memberof DnsManager
 * @description Exported function for backward compatibility.
 * @returns {string}
 */
const getLocalIPv4Address = Dns.getLocalIPv4Address;

// Export the class as default and all original identifiers for backward compatibility.
export default Dns;

export { Dns, ip, isInternetConnection, getLocalIPv4Address };
