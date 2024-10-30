import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';

import { ip } from './network.js';
import { loggerFactory } from './logger.js';
import { isIPv4 } from 'is-ip';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

axios.defaults.httpsAgent = httpsAgent;

dotenv.config();

const logger = loggerFactory(import.meta);

const Dns = {
  ip: null,
  ipDaemon: null,
  callback: () => null,
  InitIpDaemon: async function () {
    // WAN | NAT-VPS | LAN
    // enabled DMZ Host to proxy IP 80-443 (79-444) sometimes router block first port
    // LAN server or device's local servers port ->  3000-3100 (2999-3101)
    // DNS Records: [ANAME](Address Dynamic) -> [A](ipv4) host | [AAAA](ipv6) host -> [ip]
    // DHCP (Dynamic Host Configuration Protocol) LAN reserver IP -> MAC ID
    // Forward the router's TCP/UDP ports to the LAN device's IP address

    const privateCronConfPath = `./engine-private/conf/${process.argv[2]}/conf.cron.json`;

    const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';

    let confCronData = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));
    if (confCronData.ipDaemon.disabled) return;
    Dns.ip = confCronData.ipDaemon.ip;
    logger.info(`Current ip`, Dns.ip);
    if (Dns.ipDaemon) clearInterval(Dns.ipDaemon);
    const callback = async () => {
      let testIp;
      try {
        testIp = await ip.public.ipv4();
      } catch (error) {
        logger.error(error, { testIp, stack: error.stack });
      }
      if (testIp && typeof testIp === 'string' && isIPv4(testIp) && Dns.ip !== testIp) {
        logger.info(`New ip`, testIp);
        Dns.ip = testIp;
        confCronData.ipDaemon.ip = Dns.ip;
        fs.writeFileSync(confCronPath, JSON.stringify(confCronData, null, 4), 'utf8');
        for (const recordType of Object.keys(confCronData.records)) {
          switch (recordType) {
            case 'A':
              for (const dnsProvider of confCronData.records[recordType]) {
                if (typeof Dns.services.updateIp[dnsProvider.dns] === 'function')
                  await Dns.services.updateIp[dnsProvider.dns](dnsProvider);
              }
              break;

            default:
              break;
          }
        }
      }
    };
    this.callback = callback;
    return callback;
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
