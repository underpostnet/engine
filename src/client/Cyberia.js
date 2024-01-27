import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { Modal } from './components/core/Modal.js';
import { BtnIcon } from './components/core/BtnIcon.js';
import { Translate, TranslateCore } from './components/core/Translate.js';
import { ColorPalette } from './components/core/ColorPalette.js';
import { append, disableOptionsClick } from './components/core/VanillaJs.js';
import { Css, Themes } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { newInstance, s4 } from './components/core/CommonJs.js';
import { FullScreen } from './components/core/FullScreen.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { Settings } from './components/cyberia/Settings.js';
import { Bag } from './components/cyberia/Bag.js';
import { JoyStick } from './components/cyberia/JoyStick.js';
import { BiomeEngine } from './components/cyberia/Biome.js';
import { EventsUI } from './components/core/EventsUI.js';
import { Tile } from './components/cyberia/Tile.js';
import { CssCyberia } from './components/cyberia/CssCyberia.js';
import { Polyhedron } from './components/core/Polyhedron.js';
import { World } from './components/cyberia/World.js';
import { MainUser } from './components/cyberia/MainUser.js';
import { LoadingAnimation } from './components/core/LoadingAnimation.js';
import { SocketIoCyberia } from './components/cyberia/SocketIoCyberia.js';
import { Chat } from './components/core/Chat.js';
import { SignUp } from './components/core/SignUp.js';
import { LogIn } from './components/core/LogIn.js';
import { LogOut } from './components/core/LogOut.js';
import { LogOutCyberia } from './components/cyberia/LogOutCyberia.js';
import { LogInCyberia } from './components/cyberia/LogInCyberia.js';

await LoadingAnimation.bar.play('init-loading');

const { barConfig } = await Css.Init(CssCyberia);

await TranslateCore.Init();
await TranslateCyberia.Init();

await Keyboard.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});

append('body', await MainUser.Render());
await Pixi.Init();

await Responsive.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await FullScreen.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});

await NotificationManager.RenderBoard();

append('body', await JoyStick.Render());

await Modal.Render({
  id: 'modal-menu',
  html: html`
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
    ${await BtnIcon.Render({ class: 'main-btn main-btn-chat', label: 'Chat' })}
    ${await BtnIcon.Render({ class: 'main-btn main-btn-biome', label: 'Biome Engine' })}
    ${await BtnIcon.Render({ class: 'main-btn main-btn-tile', label: 'Tile Engine' })}
    ${await BtnIcon.Render({ class: 'main-btn main-btn-3d', label: '3D Engine' })}
    ${await BtnIcon.Render({ class: 'main-btn main-btn-world', label: 'World Engine' })}
  `,
  barConfig: newInstance(barConfig),
  title: html`C Y B E R I A`,
  // titleClass: 'hide',
  mode: 'slide-menu',
});

EventsUI.onClick(`.main-btn-settings`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-settings',
    barConfig,
    title: Translate.Render('settings'),
    html: async () => await Settings.Render(),
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-bag`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-bag',
    barConfig,
    title: Translate.Render('bag'),
    html: async () => await Bag.Render(),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-colors`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-pallet-colors',
    barConfig,
    title: Translate.Render('pallet-colors'),
    html: async () => ColorPalette.Render(),
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-biome`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-biome',
    barConfig,
    title: 'Biome engine',
    html: async () => await BiomeEngine.Render({ idModal: 'modal-biome' }),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-tile`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-tile-engine',
    barConfig,
    title: 'Tile engine',
    html: async () => await Tile.Render({ idModal: 'modal-tile-engine' }),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-3d`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-3d-engine',
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
  });
});

EventsUI.onClick(`.main-btn-world`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-world-engine',
    barConfig,
    title: 'World Engine',
    html: async () => await World.Render({ idModal: 'modal-world-engine' }),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-sign-up`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-sign-up',
    barConfig,
    title: Translate.Render('sign-up'),
    html: async () => await SignUp.Render({ idModal: 'modal-sign-up' }),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-log-out`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-log-out',
    barConfig,
    title: Translate.Render('log-out'),
    html: async () => await LogOut.Render(),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-log-in`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-log-in',
    barConfig,
    title: Translate.Render('log-in'),
    html: async () => await LogIn.Render(),
    handleType: 'bar',
    maximize: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

EventsUI.onClick(`.main-btn-chat`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-chat',
    barConfig,
    title: 'Chat',
    html: async () => await Chat.Render({ idModal: 'modal-chat' }),
    handleType: 'bar',
    maximize: true,
    observer: true,
    mode: 'view',
    slideMenu: 'modal-menu',
  });
});

disableOptionsClick('html', ['drag', 'select']);

// await BiomeEngine.generateBiome('seed-city');

await (async () => {
  // ws or rest init user data

  Elements.Init({ type: 'user', id: 'main' });

  await SocketIo.Init({
    channels: Elements.Data,
  });

  await SocketIoCyberia.Init();

  await LogOutCyberia();
  await LogInCyberia();
})();
