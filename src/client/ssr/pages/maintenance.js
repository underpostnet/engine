import { htmls, loggerFactory } from '../common/SsrCore.js';
import { Alert } from '../common/Alert.js';
import { Translate } from '../common/Translate.js';
import { Worker } from '../common/Worker.js';
/*imports*/

const logger = loggerFactory({ url: location.href });

window.onload = () =>
  Worker.instance({
    render: async () => {
      htmls(`.page-render`, html`${await Alert.maintenance({ Translate })}`);
    },
  });
