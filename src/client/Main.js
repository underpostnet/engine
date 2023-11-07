import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { Modal } from './components/core/Modal.js';
import { BtnIcon } from './components/core/BtnIcon.js';
import { Translate } from './components/core/Translate.js';
import { ColorPalette } from './components/core/ColorPalette.js';
import { s, append } from './components/core/VanillaJs.js';
import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { Matrix } from './components/cyberia/Matrix.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';

await Css.import.fontawesome();
await Css.Init({ theme: 'cryptokoyn' });
// await Css.Init({ theme: 'default' });
// await Css.Init({ theme: 'dark' });
await SocketIo.Init({
  channels: Elements.Data,
});
await Keyboard.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await Elements.Init();
await Pixi.Init();
await Responsive.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
await Matrix.InitCamera();

await NotificationManager.RenderBoard();

await TranslateCyberia.Init();

await Modal.Render({
  id: 'modal-menu',
  html: `
  ${await BtnIcon.Render({ class: 'main-btn-bag', label: Translate.Render('bag') })}
  ${await BtnIcon.Render({ class: 'main-btn-colors', label: Translate.Render('pallet-colors') })}
  `,
  disabledCloseBtn: true,
  title: 'menu',
  style: {
    top: '5px',
    left: '5px',
  },
});

s(`.main-btn-bag`).onclick = async () => await Modal.Render({ id: 'modal-bag', title: Translate.Render('bag') });

s(`.main-btn-colors`).onclick = async () =>
  await Modal.Render({
    id: 'modal-pallet-colors',
    title: Translate.Render('pallet-colors'),
    html: ColorPalette.Render(),
  });
