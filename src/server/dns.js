import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import validator from 'validator';
import { publicIp, publicIpv4, publicIpv6 } from 'public-ip';
import { loggerFactory } from './logger.js';
import UnderpostRootEnv from '../cli/env.js';
import dns from 'node:dns';

dotenv.config();

const logger = loggerFactory(import.meta);

const ip = {
  public: {
    get: async () => await publicIp(), // => 'fe80::200:f8ff:fe21:67cf'
    ipv4: async () => await publicIpv4(), // => '46.5.21.123'
    ipv6: async () => await publicIpv6(), // => 'fe80::200:f8ff:fe21:67cf'
  },
};

const isInternetConnection = (domain = 'google.com') =>
  new Promise((resolve) => dns.lookup(domain, {}, (err) => resolve(err ? false : true)));

class Dns {
  static callback = async function (deployList) {
    // Network topology configuration:
    // LAN -> [NAT-VPS](modem/router device) -> WAN
    // enabled DMZ Host to proxy IP 80-443 (79-444) sometimes router block first port
    // disabled local red DHCP
    // verify inet ip proxy server address
    // DHCP (Dynamic Host Configuration Protocol) LAN reserver IP -> MAC ID
    // LAN server or device's local servers port ->  3000-3100 (2999-3101)
    // DNS Records: [ANAME](Address Dynamic) -> [A](ipv4) host | [AAAA](ipv6) host -> [public-ip]
    // Forward the router's TCP/UDP ports to the LAN device's IP address
    const isOnline = await isInternetConnection();

    if (!isOnline) return;

    for (const _deployId of deployList.split(',')) {
      const deployId = _deployId.trim();
      const privateCronConfPath = `./engine-private/conf/${deployId}/conf.cron.json`;
      const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';
      const confCronData = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

      let testIp;

      try {
        testIp = await ip.public.ipv4();
      } catch (error) {
        logger.error(error, { testIp, stack: error.stack });
      }

      const currentIp = UnderpostRootEnv.API.get('ip');

      if (testIp && typeof testIp === 'string' && validator.isIP(testIp) && currentIp !== testIp) {
        logger.info(`new ip`, testIp);
        UnderpostRootEnv.API.set('monitor-input', 'pause');
        for (const recordType of Object.keys(confCronData.records)) {
          switch (recordType) {
            case 'A':
              for (const dnsProvider of confCronData.records[recordType]) {
                if (typeof Dns.services.updateIp[dnsProvider.dns] === 'function')
                  await Dns.services.updateIp[dnsProvider.dns]({ ...dnsProvider, ip: testIp });
              }
              break;

            default:
              break;
          }
        }
        try {
          const ipUrlTest = `https://${process.env.DEFAULT_DEPLOY_HOST}`;
          const response = await axios.get(ipUrlTest);
          const verifyIp = response.request.socket.remoteAddress;
          logger.info(ipUrlTest + ' verify ip', verifyIp);
          if (verifyIp === testIp) {
            logger.info('ip updated successfully', testIp);
            UnderpostRootEnv.API.set('ip', testIp);
            UnderpostRootEnv.API.delete('monitor-input');
          } else logger.error('ip not updated', testIp);
        } catch (error) {
          logger.error(error, error.stack);
          logger.error('ip not updated', testIp);
        }
      }
    }
  };

  static services = {
    updateIp: {
      dondominio: (options) => {
        const { user, api_key, host, dns, ip } = options;
        const url = `https://dondns.dondominio.com/json/?user=${user}&password=${api_key}&host=${host}&ip=${ip}`;
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
  };
}

export default Dns;

export { Dns, ip, isInternetConnection };
