import { Account } from '../core/Account.js';
import { BlockChainManagement } from '../core/Blockchain.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { Chat } from '../core/Chat.js';
import { ColorPalette } from '../core/ColorPalette.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, ThemeEvents, Themes, darkTheme } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal, renderMenuLabel, renderViewTitle } from '../core/Modal.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { htmls, s } from '../core/VanillaJs.js';
import { getProxyPath } from '../core/Router.js';
import { BiomeCyberiaEngine } from './BiomeCyberiaAdmin.js';
import { ElementsCyberiaAdmin } from './ElementsCyberiaAdmin.js';
import { RouterCyberiaAdmin, BannerAppTemplate } from './RoutesCyberiaAdmin.js';
import { ServerCyberiaAdmin } from './ServerCyberiaAdmin.js';
import { SettingsCyberiaAdmin } from './SettingsCyberiaAdmin.js';
import { TileCyberia } from '../cyberia/TileCyberia.js';
import { WorldCyberia } from '../cyberia/WorldCyberia.js';
import Sortable from 'sortablejs';
import { Recover } from '../core/Recover.js';
import { CyberiaTileManagement } from '../../services/cyberia-tile/cyberia-tile.management.js';
import { InstanceEngineCyberiaAdmin } from './InstanceEngineCyberiaAdmin.js';

const MenuCyberiaAdmin = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterCyberiaAdmin();

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
            tabHref: `${getProxyPath()}`,
            handleContainerClass: 'handle-btn-container',
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-colors hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'pallet-colors.png', text: Translate.Render('pallet-colors') }),
            attrs: `data-id="colors"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}colors`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-settings',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'settings.png', text: Translate.Render('settings') }),
            attrs: `data-id="settings"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}settings`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-in',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'log-in.png', text: Translate.Render('log-in') }),
            attrs: `data-id="log-in"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}log-in`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-sign-up hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'sign-up.png', text: Translate.Render('sign-up') }),
            attrs: `data-id="sign-up"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}sign-up`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-out',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'log-out.png', text: Translate.Render('log-out') }),
            attrs: `data-id="log-out"`,
            style: 'display: none',
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}log-out`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-account',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'account.png', text: Translate.Render('account') }),
            style: 'display: none',
            attrs: `data-id="account"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}account`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-chat hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'chat.png', text: 'Chat' }),
            attrs: `data-id="chat"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}chat`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-biome hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'BiomeCyberia Engine' }),
            attrs: `data-id="biome"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}biome`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-tile hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'TileCyberia Engine' }),
            attrs: `data-id="tile"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}tile`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-3d hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: '3D Engine' }),
            attrs: `data-id="3d"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}3d`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-world hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'WorldCyberia Engine' }),
            attrs: `data-id="world"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}world`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-item hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'ItemCyberia Engine' }),
            attrs: `data-id="item"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}item`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-cyberia-tile-management hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'TileCyberia Management' }),
            attrs: `data-id="cyberia-tile-management"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}cyberia-tile-management`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-blockchain hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'BlockChain Engine' }),
            attrs: `data-id="blockchain"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}blockchain`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-cloud hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'cloud.png', text: 'Cloud' }),
            attrs: `data-id="cloud"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}cloud`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-server hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'server.png', text: 'Server' }),
            attrs: `data-id="server"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}server`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-recover hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'arrow-left.png', text: Translate.Render('recover') }),
            attrs: `data-id="recover"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}recover`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-cyberia-instance-engine hide',
            useMenuBtn: true,
            label: renderMenuLabel({ img: 'engine.png', text: 'Cyberia Instance Engine' }),
            attrs: `data-id="cyberia-instance-engine"`,
            handleContainerClass: 'handle-btn-container',
            tabHref: `${getProxyPath()}cyberia-instance-engine`,
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
      // disableTools: ['navigator', 'text-box', 'lang', 'theme', 'app-icon', 'center'],
      heightTopBar,
      heightBottomBar,
      barConfig: newInstance(barConfig),
      title: BannerAppTemplate,
      // titleClass: 'hide',
      mode: 'slide-menu',
      RouterInstance,
      homeModals: [],
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
      // Element dragging started
      onStart: function (/**Event*/ evt) {
        // evt.oldIndex; // element index within parent
      },
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
        html: async () => await SettingsCyberiaAdmin.Render(),
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-colors`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-pallet-colors',
        route: 'colors',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'pallet-colors.png', text: Translate.Render('pallet-colors') }),
        html: async () => await ColorPalette.Render(),
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-biome`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-biome',
        route: 'biome',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'BiomeCyberia engine' }),
        html: async () => await BiomeCyberiaEngine.Render({ idModal: 'modal-biome' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-tile`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-tile-engine',
        route: 'tile',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'TileCyberia engine' }),
        html: async () => await TileCyberia.Render({ idModal: 'modal-tile-engine' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-3d`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-3d-engine',
        route: '3d',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: '3d Engine' }),
        html: async () =>
          await Polyhedron.Render({
            idModal: 'modal-3d-engine',
            style: {
              face: {
                background: `rgba(0, 0, 0, 0.5)`,
                border: `2px solid #620000ff`,
                'font-size': `30px`,
              },
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

    EventsUI.onClick(`.main-btn-world`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-world-engine',
        route: 'world',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'WorldCyberia Engine' }),
        html: async () => await WorldCyberia.Render({ idModal: 'modal-world-engine' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-item`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-item-engine',
        route: 'item',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'ItemCyberia Engine' }),
        html: async () => 'test',
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
          await Account.Render({ idModal: 'modal-account', user: ElementsCyberiaAdmin.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-blockchain`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-blockchain',
        route: 'blockchain',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'blockchain' }),
        html: async () => await BlockChainManagement.Render({ idModal: 'modal-blockchain' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-cloud`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cloud',
        route: 'cloud',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'cloud.png', text: 'cloud' }),
        html: async () => await FileExplorer.Render({ idModal: 'modal-cloud' }),
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
          await ServerCyberiaAdmin.Render({
            idModal: 'modal-server',
            events: {
              'change-server': async ({ name }) => {
                const { protocol, hostname } = window.location;
                return (location.href = `${protocol}//${hostname}/${name}`);
              },
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

    EventsUI.onClick(`.main-btn-cyberia-tile-management`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cyberia-tile-management',
        route: 'cyberia-tile-management',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'cyberia-tile-management' }),
        html: async () => await CyberiaTileManagement.RenderTable({ Elements: ElementsCyberiaAdmin }),
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
          await Recover.Render({ idModal: 'modal-recover', user: ElementsCyberiaAdmin.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
        heightTopBar,
        heightBottomBar,
      });
    });

    EventsUI.onClick(`.main-btn-cyberia-instance-engine`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cyberia-instance-engine',
        route: 'cyberia-instance-engine',
        barConfig,
        title: renderViewTitle({ 'ui-icon': 'engine.png', text: 'cyberia-instance-engine' }),
        html: async () => await InstanceEngineCyberiaAdmin.Render({ idModal: 'modal-cyberia-instance-engine' }),
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

export { MenuCyberiaAdmin };
