import { CryptoService } from '../../services/crypto/crypto.service.js';
import { UserService } from '../../services/user/user.service.js';
import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { getId } from './CommonJs.js';
import { dynamicCol } from './Css.js';
import { EventsUI } from './EventsUI.js';
import { NotificationManager } from './NotificationManager.js';
import { Translate } from './Translate.js';
import { copyData, htmls, s } from './VanillaJs.js';

const Wallet = {
  Data: {},
  Render: async function (options) {
    const id = getId(this.Data, 'wallet-');
    setTimeout(async () => {
      EventsUI.onClick(`.btn-generate-keys-${id}`, async (e) => {
        e.preventDefault();

        const algorithm = {
          name: 'ECDSA',
          namedCurve: 'P-384',
          hash: 'SHA-256',
        };
        const format = 'jwk';

        (async () => {
          return;
          const { data: payload } = await UserService.get({ id: 'public-key-sign-token' });

          const signature = await window.crypto.subtle.sign(
            algorithm,
            keyPair.privateKey,
            new TextEncoder().encode(payload), // Encode data to Uint8Array,
          );

          const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
        })();

        const keyPair = await window.crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
        const privateKey = await window.crypto.subtle.exportKey(format, keyPair.privateKey);
        const publicKey = await window.crypto.subtle.exportKey(format, keyPair.publicKey);

        const displayKeys = JSON.stringify({ privateKey, publicKey }, null, 4);
        htmls('.keys-display', displayKeys);

        if (Auth.getToken()) {
          const result = await CryptoService.post({
            body: {
              data: JSON.stringify(publicKey),
              format,
              algorithm,
            },
          });
        }

        NotificationManager.Push({
          // html: Translate.Render(`${result.status}-generate-keys`),
          html: Translate.Render(`success-generate-keys`),
          // status: result.status,
          status: 'success',
        });

        EventsUI.onClick(`.btn-copy-keys-${id}`, async (e) => {
          e.preventDefault();
          await copyData(displayKeys);
          NotificationManager.Push({
            html: Translate.Render('success-copy-data'),
            status: 'success',
          });
        });
      });
    });
    return html`
      ${dynamicCol({ containerSelector: options.idModal, id: `wallet-${id}` })}
      <div class="fl">
        <div class="in fll wallet-${id}-col-a">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fas fa-key"></i> JWK Management</div>
            <div class="in section-mp m">
              Client side <b>JSON Web Keys</b> (<a href="https://datatracker.ietf.org/doc/html/rfc7517">RFC7517</a>)
              based on elliptic curve digital signature,
              <a href="https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto">more info</a>.
            </div>
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-generate-keys-${id}`,
              label: html`<i class="fa-solid fa-arrows-rotate"></i> ${Translate.Render('generate')}
                ${Translate.Render('keys')}`,
            })}
            ${await BtnIcon.Render({
              class: `inl section-mp btn-custom btn-copy-keys-${id}`,
              label: html`<i class="fas fa-copy"></i> ${Translate.Render('copy')} ${Translate.Render('keys')}`,
            })}
          </div>
        </div>
        <div class="in fll wallet-${id}-col-b">
          <div class="in section-mp">
            <pre class="in keys-display"></pre>
          </div>
        </div>
      </div>
    `;
  },
};

export { Wallet };
