import { BtnIcon } from './BtnIcon.js';
import { Modal } from './Modal.js';
import { Translate } from './Translate.js';
import { getProxyPath, htmls, s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const Docs = {
  RenderSrcDoc: function () {
    return html` <iframe class="in docs-iframe" src="${getProxyPath()}docs/engine/2.0.0"> </iframe>`;
  },
  RenderApiDoc: function () {
    return html` <iframe class="in docs-iframe" src="${getProxyPath()}api-docs"> </iframe>`;
  },
  Render: async function (options) {
    setTimeout(() => {
      Modal.Data[options.idModal].observerEvent[options.idModal] = (args) => {
        if (s(`.docs-iframe`)) s(`.docs-iframe`).style.height = `${args.height * 0.83}px`;
      };

      s(`.btn-src-docs`).onclick = () => {
        htmls(`.docs-render`, this.RenderSrcDoc());
        Modal.Data[options.idModal].observerCallBack();
      };
      s(`.btn-api-docs`).onclick = () => {
        htmls(`.docs-render`, this.RenderApiDoc());
        Modal.Data[options.idModal].observerCallBack();
      };
    });

    return html`
      <style>
        .${options.idModal} {
          overflow: hidden;
        }
        .docs-iframe {
          width: 100%;
          border: none;
          margin: 2px;
        }
        .btn-docs-menu {
          padding: 10px;
        }
        .doc-fa-icon {
          font-size: 25px;
          margin: 5px;
        }
      </style>

      <div class="fl">
        <div class="in fll" style="width: 15%">
          ${await BtnIcon.Render({
            class: 'wfa btn-docs-menu btn-src-docs',
            label: html`<i class="fa-brands fa-osi doc-fa-icon"></i><br />
              Source<br />
              Docs`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'wfa btn-docs-menu btn-api-docs',
            label: html`<i class="fa-solid fa-arrows-turn-to-dots doc-fa-icon"></i><br />
              Api <br />Docs`,
            type: 'button',
          })}
        </div>
        <div class="in fll" style="width: 85%">
          <div class="in docs-render">${this.RenderSrcDoc()}</div>
        </div>
      </div>
    `;
  },
};

export { Docs };
