import {
  getLang,
  s,
  append,
  s4,
  range,
  timer,
  htmls,
  newInstance,
  fullScreenIn,
  borderChar,
  loggerFactory,
} from '../common/SsrCore.js';
import { Alert } from '../common/Alert.js';
import { Translate } from '../common/Translate.js';
/*imports*/

const logger = loggerFactory({ url: '/offline.js' });

window.onload = async () => {
  window.serviceWorkerReady = true;
  append(
    'body',
    html`
      <style>
        body {
          background-color: #dcdcdc;
          color: #191919;
          font-family: arial;
          font-size: 16px;
        }
      </style>
      ${await Alert.maintenance({ Translate })}
    `,
  );
  window.ononline = () => {
    location.href = '/';
  };
};
