import { Account } from '../core/Account.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { Chat } from '../core/Chat.js';
import { ColorPalette } from '../core/ColorPalette.js';
import { newInstance } from '../core/CommonJs.js';
import { Css, Themes } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { LogOut } from '../core/LogOut.js';
import { Modal } from '../core/Modal.js';
import { Polyhedron } from '../core/Polyhedron.js';
import { SignUp } from '../core/SignUp.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';
import { Bag } from './Bag.js';
import { BiomeEngine } from './Biome.js';
import { Elements } from './Elements.js';
import { RouterCyberia } from './RoutesCyberia.js';
import { Settings } from './Settings.js';
import { Tile } from './Tile.js';
import { World } from './World.js';

const Menu = {
  Render: async function () {
    const RouterInstance = RouterCyberia();
    const { NameApp } = RouterInstance;
    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.Render({
      id: 'modal-menu',
      html: html`
        ${await BtnIcon.Render({ class: 'main-btn main-btn-home', label: 'Home' })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-bag', label: Translate.Render('bag') })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-colors', label: Translate.Render('pallet-colors') })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-settings', label: Translate.Render('settings') })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-log-in', label: Translate.Render('log-in') })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-sign-up', label: Translate.Render('sign-up') })}
        ${await BtnIcon.Render({
          class: 'main-btn main-btn-log-out',
          label: Translate.Render('log-out'),
          style: 'display: none',
        })}
        ${await BtnIcon.Render({
          class: 'main-btn main-btn-account',
          label: Translate.Render('account'),
          style: 'display: none',
        })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-chat', label: 'Chat' })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-biome', label: 'Biome Engine' })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-tile', label: 'Tile Engine' })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-3d', label: '3D Engine' })}
        ${await BtnIcon.Render({ class: 'main-btn main-btn-world', label: 'World Engine' })}
      `,
      barConfig: newInstance(barConfig),
      title: NameApp,
      // titleClass: 'hide',
      mode: 'slide-menu',
    });

    EventsUI.onClick(`.main-btn-settings`, async () => {
      const { barConfig } = await Themes[Css.currentTheme]();
      await Modal.Render({
        id: 'modal-settings',
        route: 'settings',
        barConfig,
        title: Translate.Render('settings'),
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
        title: Translate.Render('bag'),
        html: async () => await Bag.Render(),
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
        title: Translate.Render('pallet-colors'),
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
        title: 'Biome engine',
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
        title: 'Tile engine',
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
        title: '3d Engine',
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
        title: 'World Engine',
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
        title: Translate.Render('sign-up'),
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
        title: Translate.Render('log-out'),
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
        title: Translate.Render('log-in'),
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
        title: 'Chat',
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
        title: Translate.Render('account'),
        html: async () => await Account.Render({ idModal: 'modal-account', user: Elements.Data.user.main.model.user }),
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
};

export { Menu };
