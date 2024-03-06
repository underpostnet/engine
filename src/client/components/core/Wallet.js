import { CryptoService } from '../../services/crypto/crypto.service.js';
import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';

const Wallet = {
  Render: async function () {
    setTimeout(async () => {
      EventsUI.onClick(`.btn-generate-keys`, async (e) => {
        e.preventDefault();

        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-384',
          },
          true,
          ['sign', 'verify'],
        );
        const privateKey = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
        const publicKey = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
        const payload = { data: 'test-value' };

        const signature = await window.crypto.subtle.sign(
          {
            name: 'ECDSA',
            hash: 'SHA-256',
          },
          keyPair.privateKey,
          new TextEncoder().encode(JSON.stringify(payload)), // Encode data to Uint8Array,
        );

        const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));

        const result = await CryptoService.post({
          id: 'verify',
          body: {
            publicKey,
            signature: base64Signature,
            payload,
          },
        });
      });
    });
    return html`
      <div class="in section-mp">
        <div class="in sub-title-modal">
          <i class="fas fa-key"></i> Elliptic Curve Digital Signature Algorithm (ECDSA) Management
        </div>
      </div>
      <div class="in">
        ${await BtnIcon.Render({
          class: 'btn-generate-keys',
          label: 'Generate Keys',
        })}
      </div>
    `;
  },
};

export { Wallet };
