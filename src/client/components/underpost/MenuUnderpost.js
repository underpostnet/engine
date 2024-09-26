import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getCapVariableName, getId, newInstance, random, range, timer, uniqueArray } from '../core/CommonJs.js';
import { marked } from 'marked';
import { Css, ThemeEvents, Themes, darkTheme, renderCssAttr } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { buildBadgeToolTipMenuOption, Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getBlobFromUint8ArrayFile, getProxyPath, getRawContentFile, htmls, s } from '../core/VanillaJs.js';
import { ElementsUnderpost } from './ElementsUnderpost.js';
import Sortable from 'sortablejs';
import { RouterUnderpost } from './RoutesUnderpost.js';
import { LabGalleryUnderpost } from './LabGalleryUnderpost.js';
import { CyberpunkBloggerUnderpost } from './CyberpunkBloggerUnderpost.js';
import { Badge } from '../core/Badge.js';
import { SettingsUnderpost } from './SettingsUnderpost.js';
import { Recover } from '../core/Recover.js';
import { Panel } from '../core/Panel.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { DocumentService } from '../../services/document/document.service.js';
import { FileService } from '../../services/file/file.service.js';
import { getImageSrcFromFileData } from '../core/Input.js';
import { Auth } from '../core/Auth.js';

const MenuUnderpost = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterUnderpost();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    const badgeNotificationMenuStyle = { top: '-33px', left: '24px' };
    const barMode = undefined; // 'top-bottom-bar';
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-contracultura-cyberpunk',
            label: renderMenuLabel({
              icon: html`<i class="fa-brands fa-blogger"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('contracultura-cyberpunk')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="contracultura-cyberpunk"`,
            tabHref: `${getProxyPath()}contracultura-cyberpunk`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-lab-gallery',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-photo-film"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('lab-gallery')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="lab-gallery"`,
            tabHref: `${getProxyPath()}lab-gallery`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('blog')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-home main-btn-menu-active',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-home"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('home')}</span>`,
            }),
            // style: 'display: none',
            attrs: `data-id="home"`,
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('home')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-in',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-in-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('log-in')}</span>`,
            }),
            attrs: `data-id="log-in"`,
            tabHref: `${getProxyPath()}log-in`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-in')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-sign-up',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-plus"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('sign-up')}</span>`,
            }),
            attrs: `data-id="sign-up"`,
            tabHref: `${getProxyPath()}sign-up`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('sign-up')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-log-out',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sign-out-alt"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('log-out')}</span>`,
            }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            tabHref: `${getProxyPath()}log-out`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('log-out')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-account',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-user-circle"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('account')}</span>`,
            }),
            style: 'display: none',
            attrs: `data-id="account"`,
            tabHref: `${getProxyPath()}account`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('account')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-settings',
            label: renderMenuLabel({
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('settings')}</span>`,
            }),
            attrs: `data-id="settings"`,
            tabHref: `${getProxyPath()}settings`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('settings')),
          })}
          ${await BtnIcon.Render({
            class: 'in wfa main-btn-menu main-btn-recover hide',
            label: renderMenuLabel({
              icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
              text: html`<span class="menu-label-text">${Translate.Render('recover')}</span>`,
            }),
            attrs: `data-id="recover"`,
            tabHref: `${getProxyPath()}recover`,
            handleContainerClass: 'handle-btn-container',
            tooltipHtml: await Badge.Render(buildBadgeToolTipMenuOption('recover')),
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = `${getProxyPath()}assets/splash/mstile-144x144.png`;
          htmls(
            '.action-btn-app-icon-render',
            html`<img class="inl top-bar-app-icon ${darkTheme ? '' : `negative-color`}" src="${srcLogo}" />`,
          );
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      mode: 'slide-menu',
      heightTopBar,
      heightBottomBar,
      htmlMainBody: async function () {
        const idPanel = 'underpost-panel';
        const prefixTags = [idPanel, 'public'];
        const extension = `.md`;
        let data = [];
        const formData = [
          {
            id: 'panel-title',
            model: 'title',
            inputType: 'text',
            rules: [{ type: 'isEmpty' }],
            panel: { type: 'title' },
          },
          {
            id: 'panel-createdAt',
            model: 'createdAt',
            inputType: 'datetime-local',
            panel: { type: 'subtitle' },
            rules: [{ type: 'isEmpty' }],
            disableRender: true,
          },
          {
            id: 'panel-imageFileId',
            model: 'imageFileId',
            inputType: 'file',
            rules: [],
            panel: {},
          },
          {
            id: 'panel-tags',
            model: 'tags',
            label: {
              disabled: true,
            },
            inputType: 'text',
            panel: { type: 'tags' },
            // panel: {
            //   type: 'info-row-pin',
            //   icon: {
            //     value: html``,
            //   },
            //   newIcon: {
            //     key: html``,
            //   },
            // },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'panel-content',
            model: 'content',
            inputType: 'md',
            panel: { type: 'info-row' },
            rules: [],
            label: {
              disabled: true,
            },
          },
        ];
        const dateFormat = (date) =>
          html`<span
            style="${renderCssAttr({
              style: {
                'font-size': '14px',
                color: '#888',
              },
            })}"
            >${new Date(date).toLocaleString().replaceAll(',', '')}</span
          >`;
        const panelRender = async ({ data }) =>
          await Panel.Render({
            idPanel,
            formData,
            heightTopBar,
            heightBottomBar,
            data,
            scrollClassContainer: 'main-body',
            titleIcon: html`<i class="fa-solid fa-quote-left"></i>`,
            formContainerClass: 'session-in-log-in',
            callBackPanelRender: async function (
              options = { data, imgRender: async ({ imageUrl }) => null, htmlRender: async ({ render }) => null },
            ) {
              if (options.data.ssr) {
                return await options.htmlRender({
                  render: html`<div
                    class="abs center ssr-shimmer-search-box"
                    style="${renderCssAttr({
                      style: {
                        width: '95%',
                        height: '95%',
                        'border-radius': '10px',
                        overflow: 'hidden',
                      },
                    })}"
                  >
                    <div
                      class="abs center"
                      style="${renderCssAttr({
                        style: {
                          'font-size': '70px',
                          color: `#bababa`,
                        },
                      })}"
                    >
                      <i class="fa-solid fa-photo-film"></i>
                    </div>
                  </div>`,
                });
              }
              if (!options.data.imageFileId)
                return await options.htmlRender({
                  render: html`
                    <img
                      class="abs center"
                      style="${renderCssAttr({
                        style: {
                          width: '100px',
                          height: '100px',
                          opacity: 0.2,
                        },
                      })}"
                      src="https://underpost.net/assets/splash/apple-touch-icon-precomposed.png"
                    />
                  `,
                });

              return await options.imgRender({ imageUrl: options.data.imageFileId });
            },
            on: {
              remove: async function ({ e, data }) {
                e.preventDefault();
                const confirmResult = await Modal.RenderConfirm({
                  html: async () => {
                    return html`
                      <div class="in section-mp" style="text-align: center">
                        ${Translate.Render('confirm-delete-item')}
                        <br />
                        "${data.title}"
                      </div>
                    `;
                  },
                  id: `delete-underpost-panel-${id}`,
                });
                if (confirmResult.status === 'confirm') {
                  console.error(data);
                  const { status, message } = await DocumentService.delete({
                    id: data._id,
                  });
                  NotificationManager.Push({
                    html: status,
                    status,
                  });

                  return { status };
                }
                return { status: 'error' };
              },
              add: async function ({ data }) {
                let fileId;
                let imageFileId;
                const location = `${prefixTags.join('/')}/${getCapVariableName(data.title)}${extension}`;
                const blob = new Blob([data.content], { type: 'text/markdown' });
                const file = new File([blob], location, { type: 'text/markdown' });
                const image = data.imageFileId?.[0] ? data.imageFileId[0] : undefined;
                const tags = uniqueArray(
                  data.tags
                    .replaceAll('/', ',')
                    .replaceAll('-', ',')
                    .replaceAll(' ', ',')
                    .split(',')
                    .map((t) => t.trim())
                    .concat(prefixTags),
                );

                await (async () => {
                  const body = new FormData();
                  body.append('file', file);
                  body.append('image', image);
                  const { status, data } = await FileService.post({ body });
                  // await timer(3000);
                  NotificationManager.Push({
                    html: Translate.Render(`${status}-upload-file`),
                    status,
                  });
                  if (status === 'success') {
                    fileId = data[0]._id;
                    if (data[1]) imageFileId = data[1]._id;
                  }
                })();

                const {
                  status,
                  message,
                  data: documentData,
                } = await DocumentService.post({
                  body: {
                    location,
                    tags,
                    fileId,
                    imageFileId,
                  },
                });
                data.createdAt = dateFormat(documentData.createdAt);
                if (image) data.imageFileId = URL.createObjectURL(image);
                data.tags = tags.filter((t) => !prefixTags.includes(t));
                data.content = marked.parse(data.content);
                data.userId = ElementsUnderpost.Data.user.main.model.user._id;
                data.tools = true;
                data._id = documentData._id;

                NotificationManager.Push({
                  html: status === 'success' ? Translate.Render('success-add-post') : message,
                  status: status,
                });
                return { data, status, message };
              },
            },
          });

        const getPanelData = async () => {
          const result = await DocumentService.get({ id: `public/?tags=${prefixTags.join(',')}` });

          NotificationManager.Push({
            html: result.status === 'success' ? Translate.Render('success-get-posts') : result.message,
            status: result.status,
          });
          if (result.status === 'success') {
            data = [];
            for (const documentObject of result.data.reverse()) {
              let content, imageFileId;

              {
                const {
                  data: [file],
                  status,
                } = await FileService.get({ id: documentObject.fileId._id });

                // const ext = file.name.split('.')[file.name.split('.').length - 1];
                content = await getRawContentFile(getBlobFromUint8ArrayFile(file.data.data, file.mimetype));
              }
              if (documentObject.imageFileId) {
                const {
                  data: [file],
                  status,
                } = await FileService.get({ id: documentObject.imageFileId });

                // const ext = file.name.split('.')[file.name.split('.').length - 1];
                imageFileId = getImageSrcFromFileData(file);
              }

              data.push({
                id: documentObject._id,
                title: getCapVariableName(documentObject.location.split('/').pop().replaceAll(extension, '')),
                createdAt: dateFormat(documentObject.createdAt),
                tags: documentObject.tags.filter((t) => !prefixTags.includes(t)),
                content: marked.parse(content),
                userId: documentObject.userId,
                imageFileId,
                tools: ElementsUnderpost.Data.user.main.model.user._id === documentObject.userId,
                _id: documentObject._id,
              });
            }
          }
        };
        const renderSrrPanelData = async () =>
          await panelRender({
            data: range(0, 5).map((i) => ({
              id: i,
              title: html`<div class="fl">
                <div
                  class="in fll ssr-shimmer-search-box"
                  style="${renderCssAttr({
                    style: {
                      width: '80%',
                      height: '30px',
                      top: '-13px',
                      left: '10px',
                    },
                  })}"
                ></div>
              </div>`,
              createdAt: html`<div class="fl">
                <div
                  class="in fll ssr-shimmer-search-box"
                  style="${renderCssAttr({
                    style: {
                      width: '50%',
                      height: '30px',
                      left: '-5px',
                    },
                  })}"
                ></div>
              </div>`,
              content: html`<div class="fl section-mp">
                <div
                  class="in fll ssr-shimmer-search-box"
                  style="${renderCssAttr({
                    style: {
                      width: '80%',
                      height: '30px',
                    },
                  })}"
                ></div>
              </div>`.repeat(random(2, 4)),
              ssr: true,
            })),
          });
        MenuUnderpost.updatePanel = async () => {
          htmls(`.html-main-body`, await renderSrrPanelData());
          await getPanelData();
          htmls(`.html-main-body`, await panelRender({ data }));
        };
        if (!Auth.getToken()) setTimeout(MenuUnderpost.updatePanel);

        return await renderSrrPanelData();
      },
    });

    this.Data[id].sortable = new Sortable(s(`.menu-btn-container`), {
      animation: 150,
      group: `menu-sortable`,
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

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-user-plus"></i>`,
          text: Translate.Render('sign-up'),
        }),
        html: async () => await SignUp.Render({ idModal: 'modal-sign-up' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-sign-out-alt"></i>`,
          text: Translate.Render('log-out'),
        }),
        html: async () => await LogOut.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-sign-in-alt"></i>`,
          text: Translate.Render('log-in'),
        }),
        html: async () => await LogIn.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-lab-gallery`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-lab-gallery',
        route: 'lab-gallery',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-photo-film"></i>`,
          text: Translate.Render('lab-gallery'),
        }),
        html: async () => await LabGalleryUnderpost.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-contracultura-cyberpunk`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-contracultura-cyberpunk',
        route: 'contracultura-cyberpunk',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-brands fa-blogger"></i>`,
          text: Translate.Render('contracultura-cyberpunk'),
        }),
        html: async () => await CyberpunkBloggerUnderpost.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fas fa-user-circle"></i>`,
          text: Translate.Render('account'),
        }),
        html: async () =>
          await Account.Render({
            idModal: 'modal-account',
            user: ElementsUnderpost.Data.user.main.model.user,
            disabled: [],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: renderViewTitle({
          icon: html` <i class="fas fa-sliders-h"></i>`,
          text: Translate.Render('settings'),
        }),
        html: async () => await SettingsUnderpost.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
        barMode,
      });
    });

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({
          icon: html`<i class="fa-solid fa-arrow-rotate-left"></i>`,
          text: Translate.Render('recover'),
        }),
        html: async () =>
          await Recover.Render({ idModal: 'modal-recover', user: ElementsUnderpost.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });
  },
};

export { MenuUnderpost };
