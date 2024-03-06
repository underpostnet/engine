import { BtnIcon } from './BtnIcon.js';
import { EventsUI } from './EventsUI.js';

const Wallet = {
  Render: async function () {
    setTimeout(async () => {
      EventsUI.onClick(`.btn-generate-keys`, async (e) => {
        e.preventDefault();
      });
    });
    return html`
      ${await BtnIcon.Render({
        class: 'btn-generate-keys',
        label: 'Generate Keys',
      })}
    `;
  },
};

export { Wallet };
