import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { Chat } from '../core/Chat.js';
import { getId, newInstance, random } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { Wallet } from '../core/Wallet.js';
import { ServerCyberiaPortal } from '../cyberia-portal/ServerCyberiaPortal.js';
import { BagCyberia } from './BagCyberia.js';
import { CharacterCyberia } from './CharacterCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { QuestCyberia } from './QuestCyberia.js';
import { RouterCyberia } from './RoutesCyberia.js';
import { SettingsCyberia } from './SettingsCyberia.js';
import Sortable from 'sortablejs';
import { SocketIoCyberia } from './SocketIoCyberia.js';
import { Recover } from '../core/Recover.js';
import { MapCyberia } from './MapCyberia.js';
import { WikiCyberia } from './WikiCyberia.js';
import { Auth } from '../core/Auth.js';
import { getProxyPath } from '../core/Router.js';

const MenuCyberia = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterCyberia();
    const { BannerAppTemplate } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    const heightTopBar = 50;
    const heightBottomBar = 50;
    const onCollapseMenu = async () => {
      s(`.menu-btn-container`).style.width = null;
      htmls(
        `.btn-square-style-render`,
        html` <style>
          .main-btn-square-menu {
            width: 40px;
            height: 40px;
          }
        </style>`,
      );
    };
    const onExtendMenu = async () => {
      s(`.menu-btn-container`).style.width = '310px';
      htmls(
        `.btn-square-style-render`,
        html` <style>
          .main-btn-square-menu {
            width: 93px;
            height: 93px;
          }
        </style>`,
      );
    };
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <style>
          .btn-label-content {
            top: auto;
          }
          .handle-btn-container {
            top: -2px;
            right: -2px;
          }
          .menu-btn-container {
            margin: auto;
          }
        </style>
        <div class="btn-square-style-render"></div>
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-home main-btn-menu-active',
            label: Translate.Render('home'),
            style: 'display: none',
            attrs: `data-id="home"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-character hide',
            label: renderMenuLabel({ img: 'anon.png', text: Translate.Render('character') }),
            attrs: `data-id="character"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}character`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-bag hide',
            label: renderMenuLabel({ img: 'bag.png', text: Translate.Render('bag') }),
            attrs: `data-id="bag"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}bag`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-settings',
            label: renderMenuLabel({ img: 'settings.png', text: Translate.Render('settings') }),
            attrs: `data-id="settings"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}settings`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-in',
            label: renderMenuLabel({ img: 'log-in.png', text: Translate.Render('log-in') }),
            attrs: `data-id="log-in"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}log-in`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-sign-up',
            label: renderMenuLabel({ img: 'sign-up.png', text: Translate.Render('sign-up') }),
            attrs: `data-id="sign-up"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}sign-up`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-wallet hide',
            label: renderMenuLabel({ img: 'wallet.png', text: Translate.Render('wallet') }),
            attrs: `data-id="wallet"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}wallet`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-out hide',
            label: renderMenuLabel({ img: 'log-out.png', text: Translate.Render('log-out') }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}log-out`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-account',
            label: renderMenuLabel({ img: 'account.png', text: Translate.Render('account') }),
            style: 'display: none',
            attrs: `data-id="account"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}account`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-chat hide',
            label: renderMenuLabel({ img: 'chat.png', text: 'Chat' }),
            attrs: `data-id="chat"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}chat`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-quest hide',
            label: renderMenuLabel({ img: 'quest.png', text: 'quest' }),
            attrs: `data-id="quest"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}quest`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-server hide',
            label: renderMenuLabel({ img: 'server.png', text: 'server' }),
            attrs: `data-id="server"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}server`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-admin hide',
            label: renderMenuLabel({ img: 'engine.png', text: 'admin' }),
            attrs: `data-id="admin"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `/admin`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-recover hide',
            label: renderMenuLabel({ img: 'arrow-left.png', text: Translate.Render('recover') }),
            attrs: `data-id="recover"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}recover`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-map',
            label: renderMenuLabel({ img: 'map.png', text: Translate.Render('map') }),
            attrs: `data-id="map"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}map`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-wiki',
            label: renderMenuLabel({ img: 'wiki.png', text: Translate.Render('wiki') }),
            attrs: `data-id="wiki"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}wiki`,
          })}
        </div>
      `,
      titleRender: () => {
        ThemeEvents['titleRender'] = () => {
          const srcLogo = darkTheme
            ? `${getProxyPath()}assets/splash/favicon-white-alpha.png`
            : `${getProxyPath()}assets/splash/favicon-black-alpha.png`;
          htmls('.action-btn-app-icon-render', html`<img class="inl top-bar-app-icon" src="${srcLogo}" />`);
        };
        setTimeout(ThemeEvents['titleRender']);
        return '';
      },
      // barClass: 'hide',
      disableTools: ['navigator', 'text-box', 'lang', 'theme', 'app-icon', 'center', 'profile'],
      heightTopBar,
      heightBottomBar,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      mode: 'slide-menu',
      RouterInstance,
      homeModals: [
        'map-interaction-panel',
        'element-interaction-panel',
        'menu-interaction-panel',
        'quest-interaction-panel',
      ],
      onCollapseMenu,
      onExtendMenu,
    });
    onExtendMenu();

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

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'settings.png', text: Translate.Render('settings') }),
        html: async () => await SettingsCyberia.Render(),
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-bag`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-bag',
        route: 'bag',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'bag.png', text: Translate.Render('bag') }),
        html: async () => await BagCyberia.Render({ id: 'cyberia-bag', idModal: 'modal-bag' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'sign-up.png', text: Translate.Render('sign-up') }),
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
        title: renderViewTitle({ 'ui-icon': 'log-out.png', text: Translate.Render('log-out') }),
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
        title: renderViewTitle({ 'ui-icon': 'log-in.png', text: Translate.Render('log-in') }),
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

    EventsUI.onClick(`.main-btn-chat`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-chat',
        route: 'chat',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'chat.png', text: 'Chat' }),
        html: async () => await Chat.Render({ idModal: 'modal-chat' }),
        handleType: 'bar',
        maximize: true,
        observer: true,
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
        title: renderViewTitle({ 'ui-icon': 'account.png', text: Translate.Render('account') }),
        html: async () =>
          await Account.Render({
            idModal: 'modal-account',
            user: ElementsCyberia.Data.user.main.model.user,
            bottomRender: async () => {
              setTimeout(() => {
                s(`.btn-account-log-out`).onclick = async () => {
                  await Auth.sessionOut();
                };
              });
              return html` <div class="in">
                ${await BtnIcon.Render({
                  class: 'in section-mp form-button btn-account-log-out',
                  label: Translate.Render('log-out'),
                  type: 'button',
                })}
              </div>`;
            },
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

    EventsUI.onClick(`.main-btn-wallet`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-wallet',
        route: 'wallet',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'wallet.png', text: 'Wallet' }),
        html: async () => await Wallet.Render({ idModal: 'modal-wallet' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-character`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-character',
        route: 'character',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'anon.png', text: 'character' }),
        html: async () => await CharacterCyberia.Render({ idModal: 'modal-character' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-quest`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-quest',
        route: 'quest',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'quest.png', text: 'quest' }),
        html: async () => await QuestCyberia.Render({ idModal: 'modal-quest' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-server`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-server',
        route: 'server',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'server.png', text: 'server' }),
        html: async () =>
          await ServerCyberiaPortal.Render({
            idModal: 'modal-server',
            events: {
              'change-server': ServerCyberiaPortal.internalChangeServer,
            },
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

    EventsUI.onClick(`.main-btn-recover`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-recover',
        route: 'recover',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'arrow-left.png', text: 'recover' }),
        html: async () =>
          await Recover.Render({ idModal: 'modal-recover', user: ElementsCyberia.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-map`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-map',
        route: 'map',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'map.png', text: 'map' }),
        html: async () => await MapCyberia.Render({ idModal: 'modal-map' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-wiki`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-wiki',
        route: 'wiki',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'wiki.png', text: 'wiki' }),
        html: async () => await WikiCyberia.Render({ idModal: 'modal-wiki' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    s(`.main-btn-admin`).onclick = () => {
      const { protocol, hostname } = window.location;
      return (location.href = `${protocol}//${hostname}/admin${['', 0][random(0, 1)]}`);
    };
  },
};

export { MenuCyberia };
