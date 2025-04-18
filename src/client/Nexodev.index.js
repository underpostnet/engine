'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInNexodev } from './components/nexodev/LogInNexodev.js';
import { LogOutNexodev } from './components/nexodev/LogOutNexodev.js';
import { SignUpNexodev } from './components/nexodev/SignUpNexodev.js';
import { MenuNexodev } from './components/nexodev/MenuNexodev.js';
import { RouterNexodev } from './components/nexodev/RoutesNexodev.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsNexodev } from './components/nexodev/ElementsNexodev.js';
import { SocketIoNexodev } from './components/nexodev/SocketIoNexodev.js';
import { Worker } from './components/core/Worker.js';
import { CssNexodevDark, CssNexodevLight } from './components/nexodev/CssNexodev.js';
import { Keyboard } from './components/core/Keyboard.js';
import { NexodevParams } from './components/nexodev/CommonNexodev.js';
import { Scroll } from './components/core/Scroll.js';

window.onload = () =>
  Worker.instance({
    router: RouterNexodev,
    render: async () => {
      await Css.loadThemes([CssNexodevLight, CssNexodevDark]);
      await TranslateCore.Init();
      await Responsive.Init();
      await MenuNexodev.Render();
      await SocketIo.Init({ channels: ElementsNexodev.Data });
      await SocketIoNexodev.Init();
      await LogInNexodev();
      await LogOutNexodev();
      await SignUpNexodev();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: NexodevParams.EVENT_CALLBACK_TIME });
    },
  });
