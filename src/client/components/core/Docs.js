import { BtnIcon } from './BtnIcon.js';
import { dynamicCol } from './Css.js';
import { DropDown } from './DropDown.js';
import { Modal, renderMenuLabel } from './Modal.js';
import { listenQueryPathInstance, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const Docs = {
  viewUrl: {
    src: function () {
      return `${getProxyPath()}docs/engine/2.0.0`;
    },
    api: function () {
      return `${getProxyPath()}api-docs`;
    },
    repo: function () {
      return `https://github.com/underpostnet/engine/releases/tag/v2.0.0`;
    },
  },
  Init: async function (options) {
    return html`<div class="in section-mp">
      ${await DropDown.Render({
        id: 'dropdown-docs',
        disableClose: true,
        disableSelectLabel: true,
        disableSearchBox: true,
        open: true,
        lastSelectClass: 'hover-active',
        label: renderMenuLabel({
          icon: html`<i class="fas fa-book"></i>`,
          text: html`${Translate.Render('docs')}`,
        }),
        containerClass: '',
        data: [
          {
            type: 'src',
            label: html`<i class="fa-brands fa-osi"></i> Source Docs`,
          },
          { type: 'api', label: html`<i class="fa-solid fa-arrows-turn-to-dots"></i> Api Docs` },
          { type: 'repo', label: html`<i class="fab fa-github"></i> Last Release` },
        ].map((docTypeData) => {
          return {
            display: docTypeData.label,
            value: docTypeData.type,
            onClick: async () => {
              console.warn(this.viewUrl[docTypeData.type]());
            },
          };
        }),
      })}
    </div>`;
  },
};

export { Docs };
