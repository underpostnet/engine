import { BtnIcon } from './BtnIcon.js';
import { Css, dynamicCol, Themes } from './Css.js';
import { DropDown } from './DropDown.js';
import { Modal, renderMenuLabel, renderViewTitle } from './Modal.js';
import { listenQueryPathInstance, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const Docs = {
  RenderModal: async function (type, modalOptions) {
    const docData = this.Data.find((d) => d.type === type);
    const ModalId = `modal-docs-${docData.type}`;
    const { barConfig } = await Themes[Css.currentTheme]();
    barConfig.buttons.close.onClick = () => {
      setQueryPath({ path: 'docs' });
      Modal.removeModal(ModalId);
    };
    await Modal.Render({
      barConfig,
      title: renderViewTitle(docData),
      id: ModalId,
      html: async () => {
        return html`
          <iframe class="in iframe-${ModalId}" style="width: 100%; border: none;" src="${docData.url()}"> </iframe>
        `;
      },
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
      observer: true,
      barMode: 'top-bottom-bar',
      ...modalOptions,
    });
    Modal.Data[ModalId].onObserverListener[ModalId] = () => {
      if (s(`.iframe-${ModalId}`))
        s(`.iframe-${ModalId}`).style.height = `${s(`.${ModalId}`).offsetHeight - Modal.headerTitleHeight}px`;
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
  },
  Data: [
    {
      type: 'src',
      icon: html`<i class="fa-brands fa-osi"></i>`,
      text: 'Source Docs',
      url: function () {
        return `${getProxyPath()}docs/engine/2.5.4`;
      },
    },
    {
      type: 'api',
      icon: html`<i class="fa-solid fa-arrows-turn-to-dots"></i>`,
      text: `Api Docs`,
      url: function () {
        return `${getProxyPath()}api-docs`;
      },
    },
    {
      type: 'repo',
      icon: html`<i class="fab fa-github"></i>`,
      text: `Last Release`,
      url: function () {
        return `https://github.com/underpostnet/engine/`;
      },
    },
  ],
  Init: async function (options) {
    const { idModal } = options;
    setTimeout(() => {
      s(`.btn-docs-src`).onclick = async () => {
        setTimeout(() => setQueryPath({ path: 'docs', queryPath: 'src' }));
        await this.RenderModal('src', options.modalOptions);
      };
      s(`.btn-docs-api`).onclick = async () => {
        setTimeout(() => setQueryPath({ path: 'docs', queryPath: 'api' }));
        await this.RenderModal('api', options.modalOptions);
      };
      s(`.btn-docs-repo`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'repo');
        location.href = docData.url();
      };
      // if (!getQueryParams().p) s(`.btn-docs-src`).click();
      listenQueryPathInstance({
        id: options.idModal,
        routeId: 'docs',
        event: (path) => {
          if (s(`.btn-docs-${path}`)) s(`.btn-docs-${path}`).click();
        },
      });
    });
    let docMenuRender = '';
    for (const docData of this.Data) {
      docMenuRender += html` <div class="in">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-docs-${docData.type}`,
          label: html`${docData.icon} ${docData.text}`,
        })}
      </div>`;
    }
    return html` <div class="in section-mp">${docMenuRender}</div>`;
    return html` <div class="in section-mp">
      ${await DropDown.Render({
        id: 'dropdown-docs',
        disableClose: true,
        disableSelectLabel: true,
        disableSelectOptionsLabel: true,
        disableSearchBox: true,
        open: true,
        lastSelectClass: 'hover-active',
        label: renderMenuLabel({
          icon: html`<i class="fas fa-book"></i>`,
          text: html`${Translate.Render('docs')}`,
        }),
        containerClass: '',
        data: this.Data.map((docTypeData) => {
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
