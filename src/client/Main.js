import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { Css } from './components/core/Css.js';
import { Matrix } from './components/cyberia/Matrix.js';
import { s, append } from './components/core/VanillaJs.js';
import { Modal } from './components/core/Modal.js';
import { BtnIcon } from './components/core/BtnIcon.js';

await Css.Init();
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

const modalStyle = { background: 'rgba(0, 0, 0, 0.9)', padding: '5px', color: 'white' };

await Modal.Render({
  html: await BtnIcon.Render({ class: 'main-btn-bag', label: 'bag' }),
  style: modalStyle,
});

s(`.main-btn-bag`).onclick = async () => await Modal.Render({ style: modalStyle });
