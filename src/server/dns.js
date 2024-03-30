import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

import { ip } from './network.js';
import { loggerFactory } from './logger.js';

dotenv.config();

const logger = loggerFactory(import.meta);

const Dns = {
  ip: null,
  ipDaemon: null,
  InitIpDaemon: async function () {
    // WAN | NAT-VPS | LAN
    // DNS Records: [ANAME] -> [A] -> [ip]
    // DHCP (Dynamic Host Configuration Protocol) LAN RESERVE IP -> MAC ID
    // open ports to LAN IPv4
    const confDnsPath = './conf/conf.dns.json';
    let confDnsData = JSON.parse(fs.readFileSync(confDnsPath, 'utf8'));
    if (confDnsData.ipDaemon.disabled) return;
    this.ip = confDnsData.ipDaemon.ip;
    logger.info(`Current ip`, this.ip);
    if (this.ipDaemon) clearInterval(this.ipDaemon);
    const callback = async () => {
      const testIp = await ip.public.ipv4();
      if (this.ip !== testIp) {
        logger.info(`New ip`, testIp);
        this.ip = testIp;
        confDnsData.ipDaemon.ip = this.ip;
        fs.writeFileSync(confDnsPath, JSON.stringify(confDnsData, null, 4), 'utf8');
        for (const recordType of Object.keys(confDnsData.records)) {
          switch (recordType) {
            case 'A':
              for (const dnsProvider of confDnsData.records[recordType]) {
                if (typeof this.services.updateIp[dnsProvider.dns] === 'function')
                  await this.services.updateIp[dnsProvider.dns](dnsProvider);
              }
              break;

            default:
              break;
          }
        }
      }
    };
    await callback();
    this.ipDaemon = setInterval(async () => await callback(), confDnsData.ipDaemon.minutesTimeInterval * 1000 * 60);
  },
  services: {
    updateIp: {
      dondominio: (options) => {
        const { user, api_key, host, dns } = options;
        const url = `https://dondns.dondominio.com/json/?user=${user}&password=${api_key}&host=${host}&ip=${Dns.ip}`;
        logger.info(`${dns} update ip url`, url);
        if (process.env.NODE_ENV !== 'production') return false;
        return new Promise((resolve) => {
          axios
            .get(url)
            .then((response) => {
              logger.info(`${dns} update ip success`, response.data);
              return resolve(true);
            })
            .catch((error) => {
              logger.error(error, `${dns} update ip error`);
              return resolve(false);
            });
        });
      },
    },
  },
};

export { Dns };
