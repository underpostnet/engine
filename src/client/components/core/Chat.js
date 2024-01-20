import { Input } from './Input.js';
import { Translate } from './Translate.js';

const Chat = {
  Render: async function () {
    return html`
      ${await Input.Render({
        id: `input-chat`,
        label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('write')}`,
        containerClass: 'in section-mp container-component-hover input-container',
        placeholder: true,
      })}
    `;
  },
};

export { Chat };
