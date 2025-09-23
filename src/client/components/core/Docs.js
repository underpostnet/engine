import { Badge } from './Badge.js';
import { BtnIcon } from './BtnIcon.js';
import { Css, renderCssAttr, simpleIconsRender, ThemeEvents, Themes } from './Css.js';
import { DropDown } from './DropDown.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from './Modal.js';
import { listenQueryPathInstance, setQueryPath, closeModalRouteChangeEvent, getProxyPath } from './Router.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';
import Sortable from 'sortablejs';

// https://mintlify.com/docs/quickstart

const Docs = {
  RenderModal: async function (type, modalOptions) {
    const docData = this.Data.find((d) => d.type === type);
    const ModalId = `modal-docs-${docData.type}`;
    const { barConfig } = await Themes[Css.currentTheme]();

    await Modal.Render({
      barConfig,
      title: renderViewTitle(docData),
      id: ModalId,
      html: async () => {
        if (docData.renderHtml) return await docData.renderHtml();
        return html`
          <iframe
            class="in iframe-${ModalId}"
            style="width: 100%; border: none; background: white"
            src="${docData.url()}"
          >
          </iframe>
        `;
      },
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
      observer: true,
      barMode: 'top-bottom-bar',
      query: true,
      ...modalOptions,
    });
    Modal.Data[ModalId].onObserverListener[ModalId] = () => {
      if (s(`.iframe-${ModalId}`))
        s(`.iframe-${ModalId}`).style.height = `${s(`.${ModalId}`).offsetHeight - Modal.headerTitleHeight}px`;

      if (type.match('coverage')) {
        simpleIconsRender(`.doc-icon-coverage`);
        simpleIconsRender(`.doc-icon-coverage-link`);
      }
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
    Modal.Data[ModalId].onCloseListener[ModalId] = () => {
      closeModalRouteChangeEvent({ closedId: ModalId });
    };
  },
  Data: [
    {
      type: 'repo',
      icon: html`<i class="fab fa-github"></i>`,
      text: `Last Release`,
      url: function () {
        return `https://github.com/underpostnet/pwa-microservices-template-ghpkg/`;
      },
    },
    {
      type: 'demo',
      icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 32 32">
        <path fill="currentColor" d="M20 2v12l10-6z" />
        <path
          fill="currentColor"
          d="M28 14v8H4V6h10V4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8v4H8v2h16v-2h-4v-4h8a2 2 0 0 0 2-2v-8zM18 28h-4v-4h4z"
        />
      </svg>`,
      text: html`Demo`,
      url: function () {
        return `https://underpostnet.github.io/pwa-microservices-template-ghpkg/`;
      },
    },
    {
      type: 'src',
      icon: html`<i class="fa-brands fa-osi"></i>`,
      text: 'Source Docs',
      url: function () {
        return `${getProxyPath()}docs/engine/${window.renderPayload.version.replace('v', '')}`;
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
      type: 'coverage',
      icon: html`<img height="20" width="20" class="doc-icon-coverage" />`,
      text: `Coverage report`,
      url: function () {
        return `${getProxyPath()}docs/coverage`;
      },
      themeEvent: () => {
        if (s(`.doc-icon-coverage`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage`));
      },
    },
    {
      type: 'coverage-link',
      icon: html`<img height="20" width="20" class="doc-icon-coverage-link" />`,
      text: `Coverage`,
      url: function () {
        return `https://coveralls.io/github/underpostnet/engine`;
      },
      themeEvent: () => {
        if (s(`.doc-icon-coverage-link`)) setTimeout(() => simpleIconsRender(`.doc-icon-coverage-link`));
      },
    },
  ],
  Tokens: {},
  Init: async function (options) {
    const { idModal } = options;
    this.Tokens[idModal] = options;
    setTimeout(() => {
      const cleanActive = () => {
        s(`.btn-docs-src`).classList.remove('main-btn-menu-active');
        s(`.btn-docs-api`).classList.remove('main-btn-menu-active');
        s(`.btn-docs-coverage`).classList.remove('main-btn-menu-active');
      };
      s(`.btn-docs-src`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'src' });
        cleanActive();
        s(`.btn-docs-src`).classList.add('main-btn-menu-active');
        await this.RenderModal('src', options.modalOptions);
      };
      s(`.btn-docs-api`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'api' });
        cleanActive();
        s(`.btn-docs-api`).classList.add('main-btn-menu-active');
        await this.RenderModal('api', options.modalOptions);
      };
      s(`.btn-docs-coverage`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'coverage' });
        cleanActive();
        s(`.btn-docs-coverage`).classList.add('main-btn-menu-active');
        await this.RenderModal('coverage', options.modalOptions);
      };

      s(`.btn-docs-coverage-link`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'coverage-link');
        location.href = docData.url();
      };
      s(`.btn-docs-repo`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'repo');
        location.href = docData.url();
      };
      s(`.btn-docs-demo`).onclick = () => {
        const docData = this.Data.find((d) => d.type === 'demo');
        location.href = docData.url();
      };

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
      if (docData.themeEvent) {
        ThemeEvents[`doc-icon-${docData.type}`] = docData.themeEvent;
        setTimeout(ThemeEvents[`doc-icon-${docData.type}`]);
      }
      let tabHref, style, labelStyle;
      switch (docData.type) {
        case 'repo':
        case 'coverage-link':
          style = renderCssAttr({ style: { height: '45px' } });
          labelStyle = renderCssAttr({ style: { top: '8px', left: '9px' } });
          break;

        default:
          break;
      }
      tabHref = docData.url();
      docMenuRender += html`
        ${await BtnIcon.Render({
          class: `in wfa main-btn-menu btn-docs-${docData.type}`,
          label: html`<span class="menu-btn-icon">${docData.icon}</span
            ><span class="menu-label-text"> ${docData.text} </span>`,
          tabHref,
          handleContainerClass: 'handle-btn-container',
          tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption(docData.text, 'right')),
          attrs: `data-id="${docData.type}"`,
          handleContainerClass: 'handle-btn-container',
        })}
      `;
    }

    htmls('.menu-btn-container-children', html` <div class="fl menu-btn-container-docs">${docMenuRender}</div>`);
    if (s(`.menu-btn-container-main`)) s(`.menu-btn-container-main`).classList.add('hide');
    htmls(`.nav-path-display-${'modal-menu'}`, location.pathname);

    this.Tokens[idModal] = new Sortable(s(`.menu-btn-container-docs`), {
      animation: 150,
      group: `docs-sortable`,
      forceFallback: true,
      fallbackOnBody: true,
      handle: '.handle-btn-container',
      store: {
        /**
         * Get the order of elements. Called once during initialization.
         * @param   {Sortable}  sortable
         * @returns {Array}
         */
        get: function (sortable) {
          const order = localStorage.getItem(sortable.options.group.name);
          return order ? order.split('|') : [];
        },

        /**
         * Save the order of elements. Called onEnd (when the item is dropped).
         * @param {Sortable}  sortable
         */
        set: function (sortable) {
          const order = sortable.toArray();
          localStorage.setItem(sortable.options.group.name, order.join('|'));
        },
      },
      // chosenClass: 'css-class',
      // ghostClass: 'css-class',
      // Element dragging ended
      onEnd: function (/**Event*/ evt) {
        // console.log('Sortable onEnd', evt);
        // console.log('evt.oldIndex', evt.oldIndex);
        // console.log('evt.newIndex', evt.newIndex);
        const slotId = Array.from(evt.item.classList).pop();
        // console.log('slotId', slotId);
        if (evt.oldIndex === evt.newIndex) s(`.${slotId}`).click();

        // var itemEl = evt.item; // dragged HTMLElement
        // evt.to; // target list
        // evt.from; // previous list
        // evt.oldIndex; // element's old index within old parent
        // evt.newIndex; // element's new index within new parent
        // evt.oldDraggableIndex; // element's old index within old parent, only counting draggable elements
        // evt.newDraggableIndex; // element's new index within new parent, only counting draggable elements
        // evt.clone; // the clone element
        // evt.pullMode; // when item is in another sortable: `"clone"` if cloning, `true` if moving
      },
    });

    return '';
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
