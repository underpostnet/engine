import { Account } from '../core/Account.js';
import { BlockChainManagement } from '../core/BlockChain.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { Chat } from '../core/Chat.js';
import { ColorPalette } from '../core/ColorPalette.js';
import { getId, newInstance } from '../core/CommonJs.js';
import { Css, Themes } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { FileExplorer } from '../core/FileExplorer.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath, s } from '../core/VanillaJs.js';
import { Wallet } from '../core/Wallet.js';
import { Bag } from './Bag.js';
import { BiomeEngine } from './Biome.js';
import { Character } from './Character.js';
import { Elements } from './Elements.js';
import { RouterCyberia } from './RoutesCyberia.js';
import { Settings } from './Settings.js';
import { Tile } from './Tile.js';
import { World } from './World.js';
import Sortable from 'sortablejs';

const Menu = {
  Data: {},
  Render: async function () {
    const id = getId(this.Data, 'menu-');
    this.Data[id] = {};
    const RouterInstance = RouterCyberia();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        <div class="fl menu-btn-container">
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-home',
            label: Translate.Render('home'),
            style: 'display: none',
            attrs: `data-id="0"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-character',
            label: this.renderMenuLabel({ img: 'character.png', text: Translate.Render('character') }),
            attrs: `data-id="1"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-bag',
            label: this.renderMenuLabel({ img: 'bag.png', text: Translate.Render('bag') }),
            attrs: `data-id="2"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-colors',
            label: this.renderMenuLabel({ img: 'pallet-colors.png', text: Translate.Render('pallet-colors') }),
            attrs: `data-id="3"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-settings',
            label: this.renderMenuLabel({ img: 'settings.png', text: Translate.Render('settings') }),
            attrs: `data-id="4"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-in',
            label: this.renderMenuLabel({ img: 'log-in.png', text: Translate.Render('log-in') }),
            attrs: `data-id="5"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-sign-up',
            label: this.renderMenuLabel({ img: 'sign-up.png', text: Translate.Render('sign-up') }),
            attrs: `data-id="6"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-wallet',
            label: this.renderMenuLabel({ img: 'wallet.png', text: Translate.Render('wallet') }),
            attrs: `data-id="7"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-log-out',
            label: this.renderMenuLabel({ img: 'log-out.png', text: Translate.Render('log-out') }),
            attrs: `data-id="8"`,
            style: 'display: none',
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-account',
            label: this.renderMenuLabel({ img: 'account.png', text: Translate.Render('account') }),
            style: 'display: none',
            attrs: `data-id="9"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-chat',
            label: this.renderMenuLabel({ img: 'chat.png', text: 'Chat' }),
            attrs: `data-id="10"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-biome',
            label: this.renderMenuLabel({ img: 'engine.png', text: 'Biome Engine' }),
            attrs: `data-id="11"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-tile',
            label: this.renderMenuLabel({ img: 'engine.png', text: 'Tile Engine' }),
            attrs: `data-id="12"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-3d',
            label: this.renderMenuLabel({ img: 'engine.png', text: '3D Engine' }),
            attrs: `data-id="13"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-world',
            label: this.renderMenuLabel({ img: 'engine.png', text: 'World Engine' }),
            attrs: `data-id="14"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-blockchain',
            label: this.renderMenuLabel({ img: 'engine.png', text: 'BlockChain Engine' }),
            attrs: `data-id="15"`,
          })}
          ${await BtnIcon.Render({
            class: 'in fll main-btn-square-menu main-btn-cloud',
            label: this.renderMenuLabel({ img: 'cloud.png', text: 'Cloud' }),
            attrs: `data-id="16"`,
          })}
        </div>
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      mode: 'slide-menu',
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

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: this.renderViewTitle({ img: 'settings.png', text: Translate.Render('settings') }),
        html: async () => await Settings.Render(),
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-bag`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-bag',
        route: 'bag',
        barConfig,
        title: this.renderViewTitle({ img: 'bag.png', text: Translate.Render('bag') }),
        html: async () => await Bag.Render({ id: 'cyberia-bag' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-colors`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-pallet-colors',
        route: 'colors',
        barConfig,
        title: this.renderViewTitle({ img: 'pallet-colors.png', text: Translate.Render('pallet-colors') }),
        html: async () => ColorPalette.Render(),
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-biome`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-biome',
        route: 'biome',
        barConfig,
        title: this.renderViewTitle({ img: 'engine.png', text: 'Biome engine' }),
        html: async () => await BiomeEngine.Render({ idModal: 'modal-biome' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-tile`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-tile-engine',
        route: 'tile',
        barConfig,
        title: this.renderViewTitle({ img: 'engine.png', text: 'Tile engine' }),
        html: async () => await Tile.Render({ idModal: 'modal-tile-engine' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-3d`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-3d-engine',
        route: '3d',
        barConfig,
        title: this.renderViewTitle({ img: 'engine.png', text: '3d Engine' }),
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
      });
    });

    EventsUI.onClick(`.main-btn-world`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-world-engine',
        route: 'world',
        barConfig,
        title: this.renderViewTitle({ img: 'engine.png', text: 'World Engine' }),
        html: async () => await World.Render({ idModal: 'modal-world-engine' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-sign-up`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-sign-up',
        route: 'sign-up',
        barConfig,
        title: this.renderViewTitle({ img: 'sign-up.png', text: Translate.Render('sign-up') }),
        html: async () => await SignUp.Render({ idModal: 'modal-sign-up' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-out`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-out',
        route: 'log-out',
        barConfig,
        title: this.renderViewTitle({ img: 'log-out.png', text: Translate.Render('log-out') }),
        html: async () => await LogOut.Render(),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-log-in`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-log-in',
        route: 'log-in',
        barConfig,
        title: this.renderViewTitle({ img: 'log-in.png', text: Translate.Render('log-in') }),
        html: async () => await LogIn.Render(),
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
        title: this.renderViewTitle({ img: 'chat.png', text: 'Chat' }),
        html: async () => await Chat.Render({ idModal: 'modal-chat' }),
        handleType: 'bar',
        maximize: true,
        observer: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-account`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-account',
        route: 'account',
        barConfig,
        title: this.renderViewTitle({ img: 'account.png', text: Translate.Render('account') }),
        html: async () => await Account.Render({ idModal: 'modal-account', user: Elements.Data.user.main.model.user }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-wallet`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-wallet',
        route: 'wallet',
        barConfig,
        title: this.renderViewTitle({ img: 'wallet.png', text: 'Wallet' }),
        html: async () => await Wallet.Render({ idModal: 'modal-wallet' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-blockchain`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-blockchain',
        route: 'blockchain',
        barConfig,
        title: this.renderViewTitle({ img: 'engine.png', text: 'blockchain' }),
        html: async () => await BlockChainManagement.Render({ idModal: 'modal-blockchain' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-character`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-character',
        route: 'character',
        barConfig,
        title: this.renderViewTitle({ img: 'character.png', text: 'character' }),
        html: async () => await Character.Render({ idModal: 'modal-character' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    EventsUI.onClick(`.main-btn-cloud`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-cloud',
        route: 'cloud',
        barConfig,
        title: this.renderViewTitle({ img: 'cloud.png', text: 'cloud' }),
        html: async () => await FileExplorer.Render({ idModal: 'modal-cloud' }),
        handleType: 'bar',
        maximize: true,
        mode: 'view',
        slideMenu: 'modal-menu',
        RouterInstance,
      });
    });

    s(`.main-btn-home`).onclick = () => {
      for (const idModal of Object.keys(Modal.Data)) {
        if (Modal.Data[idModal].options.route) s(`.btn-close-${idModal}`).click();
      }
      s(`.btn-close-modal-menu`).click();
    };
  },
  renderMenuLabel: ({ img, text }) => html`<img
      class="abs center img-btn-square-menu"
      src="${getProxyPath()}assets/ui-icons/${img}"
    />
    <div class="abs center main-btn-menu-text">${text}</div>`,

  renderViewTitle: ({ img, text }) => html`<img
      class="abs img-btn-square-view-title"
      src="${getProxyPath()}assets/ui-icons/${img}"
    />
    <div class="in text-btn-square-view-title">${text}</div>`,
};

export { Menu };
