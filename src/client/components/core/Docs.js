import { BtnIcon } from './BtnIcon.js';
import { dynamicCol } from './Css.js';
import { Modal } from './Modal.js';
import { listenQueryPathInstance, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from './VanillaJs.js';

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
      s(`.modal-docs`).style.overflow = 'auto';

      const responsive = (args) => {
        if (s(`.docs-iframe`)) s(`.docs-iframe`).style.height = `${args.height * 0.83}px`;
      };
      Modal.Data[options.idModal].observerEvent[options.idModal] = responsive;

      s(`.btn-src-docs`).onclick = () => {
        htmls(`.docs-render`, this.RenderSrcDoc());
        responsive({
          width: s(`.${options.idModal}`).offsetWidth,
          height: s(`.${options.idModal}`).offsetHeight,
        });
        setQueryPath({ path: 'docs', queryPath: 'src' });
      };
      s(`.btn-api-docs`).onclick = () => {
        htmls(`.docs-render`, this.RenderApiDoc());
        responsive({
          width: s(`.${options.idModal}`).offsetWidth,
          height: s(`.${options.idModal}`).offsetHeight,
        });
        setQueryPath({ path: 'docs', queryPath: 'api' });
      };
      s(`.btn-api-repo`).onclick = () => {
        location.href = 'https://github.com/underpostnet/engine/releases/tag/v2.0.0';
      };
      if (!getQueryParams().p) s(`.btn-src-docs`).click();
      listenQueryPathInstance({
        id: options.idModal,
        routeId: 'docs',
        event: (path) => {
          if (s(`.btn-${path}-docs`)) s(`.btn-${path}-docs`).click();
        },
      });
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
      <div class="in" style="min-width: 635px">
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
            ${await BtnIcon.Render({
              class: 'wfa btn-docs-menu btn-api-repo',
              label: html`<i class="fab fa-github doc-fa-icon"></i><br />
                Last <br />
                Release`,
              type: 'button',
            })}
          </div>
          <div class="in fll" style="width: 85%">
            <div class="in docs-render"></div>
          </div>
        </div>
      </div>
    `;
  },
};

export { Docs };
