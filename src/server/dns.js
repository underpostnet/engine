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

const Dns = {
  repoUrl: `https://${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_DNS_REPO}.git`,
  callback: () => null,
  InitIpDaemon: async function ({ deployId }) {
    // NAT-VPS modem/router device configuration:
    // LAN --> [NAT-VPS] --> WAN
    // enabled DMZ Host to proxy IP 80-443 (79-444) sometimes router block first port
    // disabled local red DHCP
    // verify inet ip proxy server address
    // DHCP (Dynamic Host Configuration Protocol) LAN reserver IP -> MAC ID
    // LAN server or device's local servers port ->  3000-3100 (2999-3101)
    // DNS Records: [ANAME](Address Dynamic) -> [A](ipv4) host | [AAAA](ipv6) host -> [public-ip]
    // Forward the router's TCP/UDP ports to the LAN device's IP address

    const privateCronConfPath = `./engine-private/conf/${deployId}/conf.cron.json`;

    const confCronPath = fs.existsSync(privateCronConfPath) ? privateCronConfPath : './conf/conf.cron.json';
    let confCronData = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));
    if (confCronData.ipDaemon.disabled) return;
    Dns.ip = confCronData.ipDaemon.ip;
    logger.info(`Current ip`, Dns.ip);
    const callback = async () => {
      logger.info('init dns ip callback');
      await logger.setUpInfo();
      let testIp;
      try {
        testIp = await ip.public.ipv4();
      } catch (error) {
        logger.error(error, { testIp, stack: error.stack });
      }
      if (testIp && typeof testIp === 'string' && validator.isIP(testIp) && Dns.ip !== testIp) {
        logger.info(`New ip`, testIp);
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
            await this.saveIp(confCronPath, confCronData, testIp);
          } else logger.error('ip not updated');
        } catch (error) {
          logger.error(error), 'ip not updated';
        }
      }
    };
    await callback();
    this.callback = callback;
    return callback;
  },
  services: {
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
  },
  saveIp: async (confCronPath, confCronData, ip) => {
    Dns.ip = ip;
    confCronData.ipDaemon.ip = ip;
    fs.writeFileSync(confCronPath, JSON.stringify(confCronData, null, 4), 'utf8');
    shellExec(
      `cd ./engine-private` +
        ` && git pull ${Dns.repoUrl}` +
        ` && git add . && git commit -m "update ip ${new Date().toLocaleDateString()}"` +
        ` && git push ${Dns.repoUrl}`,
      {
        disableLog: true,
      },
    );
  },
};

export { Dns };
