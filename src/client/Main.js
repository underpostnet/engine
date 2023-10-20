import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';

import { Pixi } from './components/cyberia/Pixi.js';
import { Elements } from './components/cyberia/Elements.js';
import { Event } from './components/cyberia/Event.js';
import { Css } from './components/core/Css.js';

Css.Init();
Responsive.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
SocketIo.Init({
  channels: Elements.Data,
});
Keyboard.Init({
  globalTimeInterval: Event.Data.globalTimeInterval,
});
Elements.Init();
Pixi.Init();
