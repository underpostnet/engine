import { htmls, loggerFactory } from '../common/SsrCore.js';
import { Alert } from '../common/Alert.js';
import { Translate } from '../common/Translate.js';
import { Worker } from '../common/Worker.js';
/*imports*/

const logger = loggerFactory({ url: '/offline.js' });

window.onload = () =>
  Worker.instance({
    render: async () => {
      window.ononline = async () => {
        location.href = '/';
      };
      window.onoffline = async () => {
        htmls(`.page-render`, html`${await Alert.noInternet({ Translate })}`);
      };
      try {
        if (navigator.onLine) {
          const maintenance = await fetch(location.origin + '/favicon.ico');
          if (maintenance.status !== 200) {
            htmls(`.page-render`, html`${await Alert.maintenance({ Translate })}`);
          } else window.ononline();
        }
        throw new Error(`no internet connection`);
      } catch (error) {
        logger.error(error);
        window.onoffline();
      }
    },
  });
