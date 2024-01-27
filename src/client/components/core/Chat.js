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
    const id = options?.id ? options.id : getId(this.Data, 'chat-');
    const { idModal } = options;
    this.Data[id] = {};
    setTimeout(() => {
      Modal.Data[idModal].observerEvent[`chat-${id}`] = (options) => {
        const { width, height } = options;
        s(`.chat-box`).style.height = `${height * 0.5}px`;
      };
      Modal.Data[idModal].observerCallBack();
      s(`.btn-send-chat`).onclick = (e) => {
        e.preventDefault();
        if (!s(`.input-chat`).value) return;
        this.appendChatBox({ id: SocketIo.socket.id, message: s(`.input-chat`).value });
        SocketIo.socket.emit(
          'chat',
          JSON.stringify({
            message: s(`.input-chat`).value,
          }),
        );
        s(`.input-chat`).value = '';
      };
    });
    return html`
      <form>
        <div class="in section-mp chat-box"></div>
        ${await Input.Render({
          id: `input-chat`,
          label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('write')}`,
          containerClass: 'in section-mp container-component-hover input-container',
          placeholder: true,
        })}
        <div class="in">
          ${await BtnIcon.Render({ class: 'btn-send-chat', label: Translate.Render('send'), type: 'submit' })}
        </div>
      </form>
    `;
  },
  appendChatBox: function (options) {
    const { id, message } = options;
    append(
      `.chat-box`,
      html`
        <div class="in">
          <span class="chat-message-header">${getIsoDate(new Date())} | ${id}:</span><br />
          ${message}
        </div>
      `,
    );
    s(`.chat-box`).scrollTop = s(`.chat-box`).scrollHeight;
  },
};

export { Chat };
