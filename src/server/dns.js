/**
 * Provides a comprehensive set of DNS and IP management utilities,
 * primarily focused on dynamic DNS (DDNS) updates and network checks.
 * @module src/server/dns.js
 * @namespace UnderpostDns
 */
import axios from 'axios';
import validator from 'validator';
import { loggerFactory } from './logger.js';
import dns from 'node:dns';
import os from 'node:os';
import { shellExec, pbcopy } from './process.js';
import Underpost from '../index.js';
import { readConfJson } from './conf.js';

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
   * Gets the MAC address of the main (default route) network interface.
   * @static
   * @memberof UnderpostDns
   * @returns {string|null} The MAC address, or null if not found.
   */
  static getMainInterfaceMac() {
    const interfaceName = Dns.getDefaultNetworkInterface();
    const networkInfo = os.networkInterfaces()[interfaceName];
    if (!networkInfo || networkInfo.length === 0) {
      logger.error(`Could not find network interface: ${interfaceName}`);
      return null;
    }
    return networkInfo[0].mac;
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
   * Blocks all outbound traffic from this host, except for established/related connections.
   * This is useful for security purposes, especially in a dynamic DNS context where you want to prevent
   * any new outbound connections while still allowing existing ones (like SSH) to continue.
   * @static
   * @memberof UnderpostDns
   */
  static ensureFilterChains(chains = ['output', 'forward']) {
    // A stock RHEL 9 host with firewalld keeps its rules in `inet firewalld`;
    // there is no `inet filter` table, so every policy command below fails with
    // "No such file or directory". They used to fail silently, which is the
    // worst possible outcome for this subsystem: the caller logged a successful
    // block, the bandwidth guard latched, and the overage it exists to stop
    // kept accruing against a host that was never blocked.
    //
    // Creating our own base chains is additive rather than a firewalld
    // takeover — nftables evaluates every table, so a drop here still wins.
    const ran = (command) => shellExec(command, { silent: true, silentOnError: true })?.code === 0;
    const chainExists = (chain) => ran(`sudo nft list chain inet filter ${chain}`);
    const missing = chains.filter((chain) => !chainExists(chain));
    if (missing.length === 0) return true;
    if (!ran(`sudo nft add table inet filter`)) return false;
    for (const chain of missing) {
      const hook = chain === 'input' ? 'input' : chain;
      if (!ran(`sudo nft add chain inet filter ${chain} '{ type filter hook ${hook} priority 0; policy accept; }'`))
        return false;
    }
    return chains.every(chainExists);
  }

  /**
   * Whether a chain currently carries the given policy.
   * @static
   * @param {string} chain - Chain name in `inet filter`.
   * @param {string} policy - `accept` or `drop`.
   * @returns {boolean} True when the chain reports that policy.
   * @memberof UnderpostDns
   */
  static chainPolicyIs(chain, policy) {
    const listing = shellExec(`sudo nft list chain inet filter ${chain}`, {
      silent: true,
      stdout: true,
      silentOnError: true,
    });
    return `${listing || ''}`.includes(`policy ${policy}`);
  }

  static blockAllEgress() {
    if (!Dns.ensureFilterChains(['output', 'forward']))
      throw new Error('[dns] could not create the inet filter chains; egress is NOT blocked');

    // Clear any existing egress rules.
    shellExec(`sudo nft flush chain inet filter output`, { silent: true });
    shellExec(`sudo nft flush chain inet filter forward`, { silent: true });

    // Allow return traffic for established/related connections.
    //    This keeps existing inbound connections such as SSH alive.
    shellExec(`sudo nft add rule inet filter output ct state established,related counter accept`, { silent: true });

    // Block all new outbound connections from this host and forwarded traffic.
    shellExec(`sudo nft chain inet filter output '{ policy drop; }'`, { silent: true });
    shellExec(`sudo nft chain inet filter forward '{ policy drop; }'`, { silent: true });

    // Read the policy back. The caller latches on this command's exit code, so
    // reporting a block that did not land is what lets an overage run unbounded.
    for (const chain of ['output', 'forward'])
      if (!Dns.chainPolicyIs(chain, 'drop'))
        throw new Error(`[dns] inet filter ${chain} is not 'policy drop'; egress is NOT blocked`);

    logger.info('All outbound traffic blocked.');
  }

  /**
   * Unblocks all outbound traffic from this host and forwarded interfaces.
   * Restores default output and forward chain policies to ACCEPT and clears egress rules.
   * @static
   * @memberof UnderpostDns
   */
  static unblockAllEgress() {
    // Nothing to restore when the chains were never created — that host was
    // never blocked, and saying so beats failing on a missing table.
    if (!Dns.ensureFilterChains(['output', 'forward'])) {
      logger.info('No inet filter chains on this host; egress was never blocked.');
      return;
    }

    // Restore default chain policies to accept all traffic.
    shellExec(`sudo nft chain inet filter output '{ policy accept; }'`, { silent: true });
    shellExec(`sudo nft chain inet filter forward '{ policy accept; }'`, { silent: true });

    // Clear any existing egress blocking rules.
    shellExec(`sudo nft flush chain inet filter output`, { silent: true });
    shellExec(`sudo nft flush chain inet filter forward`, { silent: true });

    for (const chain of ['output', 'forward'])
      if (!Dns.chainPolicyIs(chain, 'accept'))
        throw new Error(`[dns] inet filter ${chain} is still not 'policy accept'; egress remains blocked`);

    logger.info('All outbound traffic unblocked and restored to default ACCEPT policy.');
  }

  /**
   * Ensures the chain every ingress rule is installed into exists.
   *
   * `inet filter` can be present with no `input` chain — a firewalld host keeps
   * its rules in `inet firewalld` and never creates one — and every ingress
   * command below then fails on a table that looks like it is there. Creating it
   * with an accept policy and no rules changes nothing by itself.
   * @static
   * @memberof UnderpostDns
   */
  static ensureIngressChain() {
    shellExec(`sudo nft add table inet filter`, { silent: true });
    shellExec(`sudo nft add chain inet filter input '{ type filter hook input priority 0; policy accept; }'`, {
      silent: true,
    });
  }

  /**
   * Blocks all new inbound traffic to this host, except for established/related connections.
   * This prevents any new incoming connections while keeping existing sessions (like SSH) alive.
   * @static
   * @memberof UnderpostDns
   */
  static blockAllIngress() {
    Dns.ensureIngressChain();
    // Clear any existing ingress rules.
    shellExec(`sudo nft flush chain inet filter input`, { silent: true });

    // Allow return traffic for established/related connections.
    // This keeps active inbound/outbound sessions alive.
    shellExec(`sudo nft add rule inet filter input ct state established,related counter accept`, { silent: true });

    // Block all new inbound connections to this host.
    shellExec(`sudo nft chain inet filter input '{ policy drop; }'`, { silent: true });

    logger.info('All new inbound traffic blocked.');
  }

  /**
   * Blocks new inbound traffic to specific TCP ports, leaving every other port
   * reachable.
   *
   * Unlike {@link UnderpostDns.blockAllIngress}, the management path survives:
   * blocking the public edge ports takes published services down while the host
   * can still be reached to put them back. That is the only form of induced
   * ingress outage a remote operator can recover from.
   * @static
   * @param {string} ports - Comma-separated TCP ports.
   * @memberof UnderpostDns
   */
  static blockIngressPort(ports) {
    Dns.ensureIngressChain();
    for (const port of Dns.portListFactory(ports))
      shellExec(`sudo nft insert rule inet filter input tcp dport ${port} counter drop`, { silent: true });
    logger.info('Inbound traffic blocked on ports', { ports: Dns.portListFactory(ports) });
  }

  /**
   * Withdraws the port rules {@link UnderpostDns.blockIngressPort} installed.
   * @static
   * @param {string} ports - Comma-separated TCP ports.
   * @memberof UnderpostDns
   */
  static unblockIngressPort(ports) {
    Dns.ensureIngressChain();
    for (const port of Dns.portListFactory(ports))
      shellExec(
        `sudo sh -c "nft -a list chain inet filter input | awk '/tcp dport ${port} .*drop/ {print \\$NF}' | ` +
          `xargs -r -n1 nft delete rule inet filter input handle"`,
        { silent: true },
      );
    logger.info('Inbound traffic unblocked on ports', { ports: Dns.portListFactory(ports) });
  }

  /** Parses a comma-separated port list, keeping only valid TCP ports. */
  static portListFactory(ports = '') {
    return `${ports || ''}`
      .split(',')
      .map((port) => Number(`${port}`.trim()))
      .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);
  }

  /**
   * Unblocks all inbound traffic to this host.
   * Restores default input chain policy to ACCEPT and clears ingress rules.
   * @static
   * @memberof UnderpostDns
   */
  static unblockAllIngress() {
    Dns.ensureIngressChain();
    // Restore default chain policy to accept all incoming traffic.
    shellExec(`sudo nft chain inet filter input '{ policy accept; }'`, { silent: true });

    // Clear any existing ingress blocking rules.
    shellExec(`sudo nft flush chain inet filter input`, { silent: true });

    logger.info('All inbound traffic unblocked and restored to default ACCEPT policy.');
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

        let confCronData;
        try {
          confCronData = readConfJson(deployId, 'cron', { resolve: true });
        } catch (error) {
          logger.warn(`Cron config file not found for deployId: ${deployId}`, { message: error.message });
          continue;
        }

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

        // Validate that required credentials are present before making any request
        if (!user || !api_key) {
          logger.error(
            `${dns} update aborted: missing credentials. ` +
              `Ensure DDNS_USER and DDNS_API_KEY environment variables are set ` +
              `or provide 'user' and 'api_key' in cron records configuration.`,
            { host, hasUser: !!user, hasApiKey: !!api_key },
          );
          return Promise.resolve(false);
        }

        if (!host) {
          logger.error(`${dns} update aborted: missing host. Set DDNS_HOST or provide 'host' in cron records.`);
          return Promise.resolve(false);
        }

        const url = `https://dondns.dondominio.com/json/?user=${user}&password=${api_key}&host=${host}&ip=${ip}`;
        // Log the update attempt without exposing the full URL containing credentials
        logger.info(`${dns} update ip request`, { host, ip });

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
              // Only log the error message — the full error object contains the request URL with credentials
              logger.error(`${dns} update ip error`, { message: error.message, host, ip });
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
   * @property {boolean} [options.blockAllEgress=false] - Block all outbound traffic from this host.
   * @property {boolean} [options.unblockAllEgress=false] - Unblock all outbound traffic.
   * @property {boolean} [options.blockAllIngress=false] - Block all new inbound traffic to this host.
   * @property {boolean} [options.unblockAllIngress=false] - Unblock all inbound traffic.
   * @property {string} [options.blockIngressPort=''] - Comma-separated TCP ports to block inbound.
   * @property {string} [options.unblockIngressPort=''] - Comma-separated TCP ports to unblock inbound.
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
      blockAllEgress: false,
      unblockAllEgress: false,
      blockAllIngress: false,
      unblockAllIngress: false,
      blockIngressPort: '',
      unblockIngressPort: '',
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

    if (options.blockAllEgress) {
      return Dns.blockAllEgress();
    }
    if (options.unblockAllEgress) {
      return Dns.unblockAllEgress();
    }
    if (options.blockIngressPort) {
      return Dns.blockIngressPort(options.blockIngressPort);
    }
    if (options.unblockIngressPort) {
      return Dns.unblockIngressPort(options.unblockIngressPort);
    }
    if (options.blockAllIngress) {
      return Dns.blockAllIngress();
    }
    if (options.unblockAllIngress) {
      return Dns.unblockAllIngress();
    }

    if (options.mac) {
      const mac = Dns.getMainInterfaceMac();
      console.log(mac);
      return mac;
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
