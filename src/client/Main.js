import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { Modal } from './components/core/Modal.js';
import { BtnIcon } from './components/core/BtnIcon.js';
import { Translate, TranslateCore } from './components/core/Translate.js';
import { ColorPalette } from './components/core/ColorPalette.js';
import { s, append, disableOptionsClick } from './components/core/VanillaJs.js';
import { Css, Themes } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { newInstance } from './components/core/CommonJs.js';
import { FullScreen } from './components/core/FullScreen.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { Matrix } from './components/cyberia/Matrix.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { Settings } from './components/cyberia/Settings.js';
import { Bag } from './components/cyberia/Bag.js';
import { JoyStick } from './components/cyberia/JoyStick.js';
import { BiomeEngine } from './components/cyberia/Biome.js';
import { EventsUI } from './components/core/EventsUI.js';

const theme = 'cyberia';
const { barConfig } = await Css.Init({ theme });

await TranslateCore.Init();
await TranslateCyberia.Init();

await SocketIo.Init({
  channels: Elements.Data,
});
await Keyboard.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});

await Pixi.Init();

await Elements.Init();

await Responsive.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await FullScreen.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await Matrix.InitCamera();

await NotificationManager.RenderBoard();

const barConfigModalMenu = newInstance(barConfig);
barConfigModalMenu.buttons.close.disabled = true;

await Modal.Render({
  id: 'modal-menu',
  html: `
  ${await BtnIcon.Render({ class: 'main-btn-bag', label: Translate.Render('bag') })}
  ${await BtnIcon.Render({ class: 'main-btn-colors', label: Translate.Render('pallet-colors') })}
  ${await BtnIcon.Render({ class: 'main-btn-settings', label: Translate.Render('settings') })}
  ${await BtnIcon.Render({ class: 'main-btn-biome', label: 'Biome engine' })}
    `,
  barConfig: barConfigModalMenu,
  title: 'menu',
  style: {
    top: '5px',
    left: '5px',
  },
});

EventsUI.onClick(`.main-btn-settings`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-settings',
    barConfig,
    title: Translate.Render('settings'),
    html: await Settings.Render(),
  });
});

EventsUI.onClick(`.main-btn-bag`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-bag',
    barConfig,
    title: Translate.Render('bag'),
    html: await Bag.Render(),
    handleType: 'bar',
  });
});

EventsUI.onClick(`.main-btn-colors`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-pallet-colors',
    barConfig,
    title: Translate.Render('pallet-colors'),
    html: ColorPalette.Render(),
  });
});

EventsUI.onClick(`.main-btn-biome`, async () => {
  const { barConfig } = await Themes[Css.currentTheme]();
  await Modal.Render({
    id: 'modal-biome',
    barConfig,
    title: 'Biome engine',
    html: async () => await BiomeEngine.Render({ IdModal: 'modal-biome' }),
    handleType: 'bar',
  });
});

append('body', await JoyStick.Render());

disableOptionsClick('html', ['menu', 'drag', 'select']);
