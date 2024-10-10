import { BtnIcon } from './BtnIcon.js';
import { rgbToHex } from './CommonJs.js';
import { Css, darkTheme, dynamicCol, renderCssAttr, ThemeEvents, Themes } from './Css.js';
import { DropDown } from './DropDown.js';
import { Modal, renderMenuLabel, renderViewTitle } from './Modal.js';
import { listenQueryPathInstance, setQueryPath } from './Router.js';
import { Translate } from './Translate.js';
import { getProxyPath, getQueryParams, htmls, s } from './VanillaJs.js';

// https://mintlify.com/docs/quickstart

const umlTypes = ['server', 'cron', 'client', 'ssr'];

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
    };
    Modal.Data[ModalId].onObserverListener[ModalId]();
  },
  Data: [
    {
      type: 'repo',
      icon: html`<i class="fab fa-github"></i>`,
      text: `Last Release`,
      url: function () {
        return `https://github.com/underpostnet/engine/`;
      },
    },
    {
      type: 'src',
      icon: html`<i class="fa-brands fa-osi"></i>`,
      text: 'Source Docs',
      url: function () {
        return `${getProxyPath()}docs/engine/2.7.5`;
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
        s(`.doc-icon-coverage`).src = `https://cdn.simpleicons.org/coveralls/${rgbToHex(
          window.getComputedStyle(s('html')).color,
        )}`;
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
        s(`.doc-icon-coverage-link`).src = `https://cdn.simpleicons.org/coveralls/${rgbToHex(
          window.getComputedStyle(s('html')).color,
        )}`;
      },
    },
  ].concat(
    umlTypes.map((umlType) => {
      const umlId = `uml-${umlType}`;
      return {
        type: umlId,
        icon: html`<i class="fas fa-sitemap"></i>`,
        text: Translate.Render(`${umlType} config uml`),
        renderHtml: function () {
          return html` <div class="in section-mp">
              <div class="in sub-title-modal"><i class="fas fa-project-diagram"></i> Schema</div>
            </div>
            <div class="in section-mp">
              <a href="${getProxyPath()}docs/plantuml/${umlType}-schema.svg" target="_blank"
                ><img class="in plantuml-svg" src="${getProxyPath()}docs/plantuml/${umlType}-schema.svg"
              /></a>
            </div>
            <div class="in section-mp">
              <div class="in sub-title-modal"><i class="fas fa-project-diagram"></i> Instance example</div>
            </div>
            <div class="in section-mp">
              <a href="${getProxyPath()}docs/plantuml/${umlType}-conf.svg" target="_blank"
                ><img class="in plantuml-svg" src="${getProxyPath()}docs/plantuml/${umlType}-conf.svg"
              /></a>
            </div>`;
        },
      };
    }),
  ),
  Init: async function (options) {
    const { idModal } = options;
    setTimeout(() => {
      s(`.btn-docs-src`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'src' });
        await this.RenderModal('src', options.modalOptions);
      };
      s(`.btn-docs-api`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'api' });
        await this.RenderModal('api', options.modalOptions);
      };
      s(`.btn-docs-coverage`).onclick = async () => {
        setQueryPath({ path: 'docs', queryPath: 'coverage' });
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

      for (const umlType of umlTypes) {
        const umlId = `uml-${umlType}`;
        s(`.btn-docs-${umlId}`).onclick = async () => {
          setQueryPath({ path: 'docs', queryPath: umlId });
          await this.RenderModal(umlId, { ...options.modalOptions, handleType: 'bar' });
        };
      }

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
          tabHref = docData.url();
          style = renderCssAttr({ style: { height: '45px' } });
          labelStyle = renderCssAttr({ style: { top: '8px', left: '9px' } });
          break;

        default:
          break;
      }
      docMenuRender += html` <div class="in">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-docs-${docData.type}`,
          label: html`${docData.icon} ${docData.text}`,
          tabHref,
          style,
          labelStyle,
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
