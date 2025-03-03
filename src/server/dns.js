import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import https from 'https';
import validator from 'validator';
import { ip } from './network.js';
import { loggerFactory } from './logger.js';
import { shellExec } from './process.js';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

axios.defaults.httpsAgent = httpsAgent;

dotenv.config();

const logger = loggerFactory(import.meta);

class Dns {
  static callback = async function (deployList) {
    // NAT-VPS modem/router device configuration:
    // LAN --> [NAT-VPS] --> WAN
    // enabled DMZ Host to proxy IP 80-443 (79-444) sometimes router block first port
    // disabled local red DHCP
    // verify inet ip proxy server address
    // DHCP (Dynamic Host Configuration Protocol) LAN reserver IP -> MAC ID
    // LAN server or device's local servers port ->  3000-3100 (2999-3101)
    // DNS Records: [ANAME](Address Dynamic) -> [A](ipv4) host | [AAAA](ipv6) host -> [public-ip]
    // Forward the router's TCP/UDP ports to the LAN device's IP address
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
      const ipFileName = `${deployId}.ip`;
      const currentIp = fs.existsSync(`./engine-private/deploy/${ipFileName}`)
        ? fs.readFileSync(`./engine-private/deploy/${ipFileName}`, 'utf8')
      : undefined;

    if (testIp && typeof testIp === 'string' && validator.isIP(testIp) && currentIp !== testIp) {
      logger.info(`new ip`, testIp);
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
        logger.info(ipUrlTest + ' IP', verifyIp);
        if (verifyIp === testIp) {
            fs.writeFileSync(`./engine-private/deploy/${ipFileName}`, testIp, 'utf8');
        } else logger.error('ip not updated');
      } catch (error) {
        logger.error(error), 'ip not updated';
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
