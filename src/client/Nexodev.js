'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssNexodev } from './components/nexodev/CssNexodev.js';
import { LogInNexodev } from './components/nexodev/LogInNexodev.js';
import { LogOutNexodev } from './components/nexodev/LogOutNexodev.js';
import { SignUpNexodev } from './components/nexodev/SignUpNexodev.js';
import { Menu } from './components/nexodev/Menu.js';
import { RouterNexodev } from './components/nexodev/RoutesNexodev.js';
import { SocketIo } from './components/core/SocketIo.js';
import { Elements } from './components/nexodev/Elements.js';
import { SocketIoNexodev } from './components/nexodev/SocketIoNexodev.js';

(async function () {
  await Css.Init(CssNexodev);
  const RouterInstance = RouterNexodev();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await SocketIo.Init({ channels: Elements.Data });
  await SocketIoNexodev.Init();
  await LogInNexodev();
  await LogOutNexodev();
  await SignUpNexodev();
  LoadRouter(RouterInstance);
})();
