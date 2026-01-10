import { BtnIcon } from './BtnIcon.js';
import { getId, getIsoDate } from './CommonJs.js';
import { Input } from './Input.js';
import { Modal } from './Modal.js';
import { SocketIo } from './SocketIo.js';
import { Translate } from './Translate.js';
import { s, append } from './VanillaJs.js';

const Chat = {
  Data: {},
  Render: async function (options) {
    const { idModal } = options;
    this.Data[idModal] = {};
    setTimeout(() => {
      Modal.Data[idModal].onObserverListener[`chat-${idModal}`] = (options) => {
        const { height } = options;
        s(`.chat-box`).style.height = `${height - 250}px`;
      };
      s(`.btn-send-chat-${idModal}`).onclick = (e) => {
        e.preventDefault();
        if (!s(`.input-chat-${idModal}`).value) return;
        this.appendChatBox({ id: SocketIo.socket.id, idModal, message: s(`.input-chat-${idModal}`).value });
        SocketIo.Emit('chat', {
          message: s(`.input-chat-${idModal}`).value,
        });
        s(`.input-chat-${idModal}`).value = '';
      };
    });
    return html`
      <form>
        <div class="in section-mp chat-box ${idModal}-chat-box"></div>
        ${await Input.Render({
          id: `input-chat-${idModal}`,
          label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('write')}`,
          containerClass: 'in section-mp width-mini-box-hover input-container-width',
          placeholder: true,
        })}
        <div class="in">
          ${await BtnIcon.Render({
            class: `btn-send-chat-${idModal}`,
            label: Translate.Render('send'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  },
  appendChatBox: function (options) {
    const { idModal, id, message } = options;
    if (!s(`.${idModal}-chat-box`)) return;
    append(
      `.${idModal}-chat-box`,
      html`
        <div class="in">
          <span class="chat-message-header">${getIsoDate(new Date())} | ${id}:</span><br />
          <span class="chat-message-body"> ${message}</span>
        </div>
      `,
    );
    s(`.${idModal}-chat-box`).scrollTop = s(`.${idModal}-chat-box`).scrollHeight;
  },
};

export { Chat };
