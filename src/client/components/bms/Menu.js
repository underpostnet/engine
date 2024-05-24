import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, Themes, dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { append, getProxyPath, getQueryParams, htmls, prepend, s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import Sortable from 'sortablejs';
import { RouterBms } from './RoutesBms.js';
import { Blog } from '../core/Blog.js';
import { CalendarBms } from './CalendarBms.js';
import { DashboardBms } from './DashboardBms.js';
import { StreamBms } from './StreamBms.js';
import { Docs } from '../core/Docs.js';
import { Content } from '../core/Content.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { Chat } from '../core/Chat.js';
import { Settings } from './Settings.js';
import { DropDown } from '../core/DropDown.js';
import { loggerFactory } from '../core/Logger.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { Validator } from '../core/Validator.js';
import { Input } from '../core/Input.js';
import { Responsive } from '../core/Responsive.js';

const logger = loggerFactory(import.meta);

const Menu = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterBms();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const slideTop = 50;
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-blog hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fa-solid fa-file-invoice"></i>`,
              text: html`${Translate.Render('blog')}`,
            }),
            attrs: `data-id="5"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-calendar hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-calendar-alt"></i>`,
              text: html`${Translate.Render('calendar')}`,
            }),
            attrs: `data-id="6"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-dashboard hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fa-solid fa-chart-line"></i>`,
              text: html`${Translate.Render('dashboard')}`,
            }),
            attrs: `data-id="7"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-stream hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fa-solid fa-video"></i>`,
              text: html`${Translate.Render('stream')}`,
            }),
            attrs: `data-id="8"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-docs hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-book"></i>`,
              text: html`${Translate.Render('docs')}`,
            }),
            attrs: `data-id="9"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-content hide',
            label: this.renderMenuLabel({
              icon: html`<i class="far fa-file"></i>`,
              text: html`${Translate.Render('content')}`,
            }),
            attrs: `data-id="10"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-cloud hide',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-cloud"></i>`,
              text: html`${Translate.Render('cloud')}`,
            }),
            attrs: `data-id="11"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-chat hide',
            label: this.renderMenuLabel({
              icon: html`<i class="far fa-comments"></i>`,
              text: html`${Translate.Render('chat')}`,
            }),
            attrs: `data-id="12"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-settings',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-sliders-h"></i>`,
              text: html`${Translate.Render('settings')}`,
            }),
            attrs: `data-id="13"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-home',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-home"></i>`,
              text: html`${Translate.Render('home')}`,
            }),
            // style: 'display: none',
            attrs: `data-id="0"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-log-in',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-sign-in-alt"></i>`,
              text: html`${Translate.Render('log-in')}`,
            }),
            attrs: `data-id="1"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-sign-up',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-user-plus"></i>`,
              text: html`${Translate.Render('sign-up')}`,
            }),
            attrs: `data-id="2"`,
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-log-out',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-sign-out-alt"></i>`,
              text: html`${Translate.Render('log-out')}`,
            }),
            attrs: `data-id="3"`,
            style: 'display: none',
          })}
          ${await BtnIcon.Render({
            class: 'wfa main-btn-menu main-btn-account',
            label: this.renderMenuLabel({
              icon: html`<i class="fas fa-user-circle"></i>`,
              text: html`${Translate.Render('account')}`,
            }),
            style: 'display: none',
            attrs: `data-id="4"`,
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      titleRender: () => html`<strong>BMS</strong>`,
      mode: 'slide-menu',
      slideTop,
      htmlMainBody: async () => {
        const formData = [
          {
            model: 'id',
            id: 'id',
            inputType: 'text',
            panel: {},
            disableRender: true,
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'propertyType',
            model: 'propertyType',
            inputType: 'dropdown',
            dropdown: {
              options: ['Single Family Home', 'Condo', 'Townhouse', 'Commercial', ' Land'],
            },
            rules: [{ type: 'isEmpty' }],
            panel: { type: 'title' },
          },
          {
            id: 'address',
            model: 'address',
            inputType: 'text',
            panel: { type: 'subtitle' },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'price',
            model: 'price',
            inputType: 'number',
            panel: {
              type: 'info-row-pin',
              icon: {
                value: html`<i class="fas fa-dollar-sign"></i>`,
              },
              newIcon: {
                key: html``,
              },
            },
            rules: [{ type: 'isEmpty' }],
          },
          {
            id: 'bedrooms',
            model: 'bedrooms',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            id: 'bathrooms',
            model: 'bathrooms',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            id: 'squareFootage',
            model: 'squareFootage',
            inputType: 'number',
            panel: { type: 'info-row' },
            rules: [],
          },
          {
            disableRender: true,
            id: 'imageUrl',
            model: 'imageUrl',
            inputType: 'file',
            panel: {},
            rules: [{ type: 'isEmpty' }],
          },
        ].map((formObj) => {
          formObj.id = `panel-${formObj.id}`;
          return formObj;
        });

        const data = [
          {
            id: 1,
            propertyType: 'Single Family Home',
            address: '123 Main Street, Anytown, CA 95123',
            price: 500000,
            bedrooms: 3,
            bathrooms: 2,
            squareFootage: 1500,
            imageUrl: 'https://example.com/property1.jpg',
            isNew: true,
          },
          {
            id: 2,
            propertyType: 'Condo',
            address: '456 Elm Street, Anytown, CA 95123',
            price: 350000,
            bedrooms: 2,
            bathrooms: 1.5,
            squareFootage: 1200,
            imageUrl: 'https://example.com/property2.jpg',
          },
          {
            id: 3,
            propertyType: 'Townhouse',
            address: '789 Oak Street, Anytown, CA 95123',
            price: 400000,
            bedrooms: 3,
            bathrooms: 2,
            squareFootage: 1400,
            imageUrl: 'https://example.com/property3.jpg',
          },
          {
            id: 4,
            propertyType: 'Commercial',
            address: '123 Main Street, Anytown, CA 95123',
            price: 1000000,
            squareFootage: 2500,
            imageUrl: 'https://example.com/property4.jpg',
          },
          {
            id: 5,
            propertyType: 'Land',
            address: '456 Elm Street, Anytown, CA 95123',
            price: 200000,
            acreage: 5,
            imageUrl: 'https://example.com/property5.jpg',
          },
        ];

        const titleKey = formData.find((f) => f.panel.type === 'title').model;
        const subTitleKey = formData.find((f) => f.panel.type === 'subtitle').model;
        const renderPanel = (obj) => {
          const { id } = obj;

          const src = 'https://api.api-ninjas.com/v1/randomimage?category=city';
          const options = {
            headers: { 'X-Api-Key': 'FyITmcxRXkCaUehbX6K0/g==uxZcFKL0dZUUg48G', Accept: 'image/jpg' },
          };

          fetch(src, options)
            .then((res) => res.blob())
            .then((blob) => {
              obj.imageUrl = URL.createObjectURL(blob);
              htmls(`.panel-cell-col-a-${id}`, html`<img class="in img-panel" src="${obj.imageUrl}" />`);
            });
          setTimeout(async () => {
            LoadingAnimation.spinner.play(`.panel-img-spinner-${id}`, 'dual-ring');
          });
          return html` <div class="in box-shadow panel">
            <div class="in panel-head">
              <div class="in panel-title">
                ${obj.new ? obj.new : html`<i class="fas fa-tag"></i>`} &nbsp ${obj[titleKey]}
              </div>
              <div class="in panel-subtitle">${obj[subTitleKey]}</div>
            </div>
            <div class="fl">
              <div class="in fll panel-cell panel-cell-col-a panel-cell-col-a-${id}">
                <div class="abs center panel-img-spinner-${id}"></div>
              </div>
              <div class="in fll panel-cell panel-cell-col-b">
                ${Object.keys(obj)
                  .map((infoKey) => {
                    const formObjData = formData.find((f) => f.model === infoKey);
                    const valueIcon = formObjData?.panel?.icon?.value ? formObjData.panel.icon.value : '';
                    const keyIcon = formObjData?.panel?.icon?.key ? formObjData.panel.icon.key : '';

                    const valueNewIcon =
                      obj.new && formObjData?.panel?.newIcon?.value ? formObjData.panel.newIcon.value : '';
                    const keyNewIcon = obj.new && formObjData?.panel?.newIcon?.key ? formObjData.panel.newIcon.key : '';

                    if (formData.find((f) => f.model === infoKey && f.panel.type === 'info-row-pin'))
                      return html`<div class="in panel-row">
                        <span class="panel-row-pin-key capitalize">${keyNewIcon} ${keyIcon} ${infoKey}:</span>
                        <span class="panel-row-pin-value">${valueNewIcon} ${valueIcon} ${obj[infoKey]}</span>
                      </div> `;

                    if (formData.find((f) => f.model === infoKey && f.panel.type === 'info-row'))
                      return html`<div class="in panel-row">
                        <span class="panel-row-key capitalize">${keyNewIcon} ${keyIcon} ${infoKey}:</span>
                        <span class="panel-row-value">${valueNewIcon} ${valueIcon} ${obj[infoKey]}</span>
                      </div> `;

                    return html``;
                  })
                  .join('')}
              </div>
            </div>
          </div>`;
        };

        let render = '';
        let renderForm = html` <div class="in modal stq" style="top: 0px; z-index: 1; padding-bottom: 5px">
          ${await BtnIcon.Render({
            class: 'section-mp btn-custom btn-panel-close',
            label: html`<i class="fa-solid fa-xmark"></i> ${Translate.Render('close')}`,
            type: 'button',
          })}
        </div>`;

        for (const modelData of formData) {
          if (modelData.disableRender) continue;
          switch (modelData.inputType) {
            case 'dropdown':
              renderForm += html` <div class="inl section-mp">
                ${await DropDown.Render({
                  id: `${modelData.id}`,
                  label: html`${Translate.Render(modelData.model)}`,
                  // type: 'checkbox',
                  value: modelData.dropdown.options[0].replaceAll(' ', '-').toLowerCase(),
                  data: modelData.dropdown.options.map((dKey) => {
                    const key = dKey.replaceAll(' ', '-').toLowerCase();
                    return {
                      value: key,
                      data: dKey,
                      // checked: true,
                      display: html`${Translate.Render(dKey)}`,
                      onClick: function () {},
                    };
                  }),
                })}
              </div>`;
              break;

            default:
              renderForm += `${await Input.Render({
                id: `${modelData.id}`,
                type: modelData.inputType,
                // autocomplete: 'new-password',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render(modelData.model)}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
                // disabled: true,
                // disabledEye: true,
              })}`;
              break;
          }
        }
        renderForm += html` <div class="in">
          ${await BtnIcon.Render({
            class: 'section-mp btn-custom btn-panel-submit',
            label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
            type: 'button',
          })}
          ${await BtnIcon.Render({
            class: 'section-mp btn-custom btn-panel-clean',
            label: html`<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
            type: 'button',
          })}
        </div>`;

        setTimeout(async () => {
          Responsive.Event['panel-responsive'] = () => {
            if (s(`.panel-form-container`))
              s(`.panel-form-container`).style.maxHeight = `${window.innerHeight - slideTop}px`;
          };
          Responsive.Event['panel-responsive']();
          const validators = await Validator.instance(formData);
          EventsUI.onClick(`.btn-panel-submit`, async (e) => {
            e.preventDefault();
            const { errorMessage } = await validators();
            if (errorMessage) return;
            const obj = Input.getValues(formData);
            obj.id = `${data.length}`;
            obj.new = html`<span class="bold" style="color: #ff533ecf;"> <i class="fa-solid fa-tag"></i> NEW ! </span>`;
            data.push(obj);
            prepend('.panel-render', renderPanel(obj));
            Input.cleanValues(formData);
            s(`.btn-panel-close`).click();
            s(`.main-body`).scrollTop = 0;
          });
          s(`.btn-panel-clean`).onclick = () => {
            Input.cleanValues(formData);
          };
          s(`.btn-panel-close`).onclick = () => {
            s(`.panel-form-body`).style.opacity = 0;
            s(`.btn-panel-add`).classList.remove('hide');
            s(`.main-body`).style.overflow = 'auto';
            setTimeout(() => {
              s(`.panel-form-body`).classList.add('hide');
            });
          };
          s(`.btn-panel-add`).onclick = () => {
            s(`.panel-form-body`).classList.remove('hide');
            s(`.btn-panel-add`).classList.add('hide');
            s(`.main-body`).style.overflow = 'hidden';
            setTimeout(() => {
              s(`.panel-form-body`).style.opacity = 1;
            });
          };
        });

        for (const obj of data) render += renderPanel(obj);

        return html`
          <style>
            .main-body {
              scroll-behavior: smooth;
            }
            .panel-form-container {
              padding-bottom: 20px;
              top: 0px;
              z-index: 1;
              overflow: auto;
            }
            .panel-form {
              max-width: 900px;
            }
            .panel-cell {
              min-height: 200px;
            }
            .panel-container {
            }
            .panel {
              margin: 10px;
              transition: 0.3s;
              cursor: default;
              border-radius: 10px;
              background: white;
              color: black;
              padding: 10px;
            }
            .panel-head {
              /* background: white; */
              margin-bottom: 10px;
            }
            .img-panel {
              width: 100%;
            }
            .panel-title {
              color: rgba(109, 104, 255, 1);
              font-size: 24px;
              padding: 15px;
            }
            .panel-row {
              padding: 5px;
              margin: 5px;
              font-size: 16px;
            }
            .panel-subtitle {
              font-size: 17px;
              margin-left: 20px;
              top: -7px;
            }
            .panel-row-key {
            }
            .panel-row-value {
            }
            .panel-row-pin-key {
            }
            .panel-row-pin-value {
              font-size: 20px;
              color: rgb(19 190 84);
            }
            .panel-form-header {
            }
            .panel-form-body {
              transition: 0.3s;
            }
            .btn-panel-add {
              padding: 10px;
              font-size: 20px;
            }
          </style>
          <div class="panel-container">
            <div class="stq modal panel-form-container session-in-log-in">
              <div class="in panel-form-header">
                ${await BtnIcon.Render({
                  class: 'section-mp wfa btn-panel-add',
                  label: html`<i class="fas fa-plus"></i> ${Translate.Render('add')}`,
                  type: 'button',
                })}
              </div>
              <div class="in panel-form-body hide" style="opacity: 0">
                <form class="in panel-form">${renderForm}</form>
              </div>
            </div>
            ${dynamicCol({
              id: `panel-cell`,
              containerSelector: `panel-render`,
              limit: 500,
              type: 'a-50-b-50',
            })}
            <div class="in panel-render">${render}</div>
          </div>
        `;
      },
    });

    this.Data[id].sortable = Modal.mobileModal()
      ? null
      : new Sortable(s(`.menu-btn-container`), {
          animation: 150,
          group: `menu-sortable`,
          forceFallback: true,
          fallbackOnBody: true,
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
        title: this.renderViewTitle({
          icon: html`<i class="fas fa-user-plus"></i>`,
          text: Translate.Render('sign-up'),
        }),
        html: async () =>
          await SignUp.Render({
            idModal: 'modal-sign-up',
            footerRender: html` <div class="in section-mp">
              ${await DropDown.Render({
                label: html`${Translate.Render('select-role')}`,
                type: 'checkbox',
                data: ['broker', 'owner'].map((dKey) => {
                  return {
                    value: dKey,
                    data: dKey,
                    checked: true,
                    display: html`${Translate.Render(dKey)}`,
                    onClick: function () {
                      logger.info('DropDown onClick', this.checked);
                    },
                  };
                }),
              })}
            </div>`,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fas fa-sign-out-alt"></i>`,
          text: Translate.Render('log-out'),
        }),
        html: async () => await LogOut.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fas fa-sign-in-alt"></i>`,
          text: Translate.Render('log-in'),
        }),
        html: async () => await LogIn.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-blog`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-blog',
        route: 'blog',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fa-solid fa-file-invoice"></i>`,
          text: Translate.Render('blog'),
        }),
        html: async () => await Blog.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fas fa-user-circle"></i>`,
          text: Translate.Render('account'),
        }),
        html: async () =>
          await Account.Render({
            idModal: 'modal-account',
            user: Elements.Data.user.main.model.user,
            disabled: ['emailConfirm'],
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-dashboard`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-dashboard',
        route: 'dashboard',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fa-solid fa-chart-line"></i>`,
          text: Translate.Render('dashboard'),
        }),
        html: async () =>
          await DashboardBms.Render({
            idModal: 'modal-dashboard',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-stream`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-stream',
        route: 'stream',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fa-solid fa-video"></i>`,
          text: Translate.Render('stream'),
        }),
        html: async () =>
          await StreamBms.Render({
            idModal: 'modal-stream',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-calendar`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-calendar',
        route: 'calendar',
        barConfig,
        title: this.renderViewTitle({
          icon: html` <i class="fas fa-calendar-alt"></i>`,
          text: Translate.Render('calendar'),
        }),
        html: async () =>
          await CalendarBms.Render({
            idModal: 'modal-calendar',
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-content`, async () => {
      let subModalId = '';
      const path =
        location.pathname[location.pathname.length - 1] === '/' ? location.pathname.slice(0, -1) : location.pathname;

      if (path.replaceAll(`${getProxyPath()}`, '') === 'content' && getQueryParams().id) {
        subModalId = `-${getQueryParams().id}`;
      }

      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: `modal-content${subModalId}`,
        route: 'content',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="far fa-file"></i>`,
          text: Translate.Render('content'),
        }),
        html: async () =>
          await Content.Render({
            idModal: `modal-content${subModalId}`,
            Menu: this,
          }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    EventsUI.onClick(`.main-btn-cloud`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cloud',
        route: 'cloud',
        barConfig,
        title: this.renderViewTitle({
          icon: html` <i class="fas fa-cloud"></i>`,
          text: Translate.Render('cloud'),
        }),
        html: async () => await FileExplorer.Render({ idModal: 'modal-cloud' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-chat`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-chat',
        route: 'chat',
        barConfig,
        title: this.renderViewTitle({
          icon: html` <i class="far fa-comments"></i>`,
          text: Translate.Render('chat'),
        }),
        html: async () => await Chat.Render({ idModal: 'modal-chat' }),
        handleType: 'bar',
        maximize: true,
        observer: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: this.renderViewTitle({
          icon: html` <i class="fas fa-sliders-h"></i>`,
          text: Translate.Render('settings'),
        }),
        html: async () => await Settings.Render({ idModal: 'modal-settings' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-docs`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-docs',
        route: 'docs',
        barConfig,
        title: this.renderViewTitle({
          icon: html`<i class="fas fa-book"></i>`,
          text: Translate.Render('docs'),
        }),
        html: async () =>
          await Docs.Render({
            idModal: 'modal-docs',
          }),
        handleType: 'bar',
        observer: true,
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        slideTop,
      });
    });

    s(`.main-btn-home`).onclick = () => {
      for (const idModal of Object.keys(Modal.Data)) {
        if (Modal.Data[idModal].options.route) s(`.btn-close-${idModal}`).click();
      }
      s(`.btn-close-modal-menu`).click();
    };
  },
  renderMenuLabel: ({ icon, text }) => html`<span class="menu-btn-icon">${icon}</span> ${text}`,

  renderViewTitle: ({ icon, text }) => html`<span class="view-title-icon">${icon}</span> ${text}`,
};

export { Menu };
