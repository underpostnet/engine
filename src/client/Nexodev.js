'use strict';

import { Css, addTheme } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssNexodev, CssNexodevLight } from './components/nexodev/CssNexodev.js';
import { LogInNexodev } from './components/nexodev/LogInNexodev.js';
import { LogOutNexodev } from './components/nexodev/LogOutNexodev.js';
import { SignUpNexodev } from './components/nexodev/SignUpNexodev.js';
import { Menu } from './components/nexodev/Menu.js';
import { RouterNexodev } from './components/nexodev/RoutesNexodev.js';
import { SocketIo } from './components/core/SocketIo.js';
import { Elements } from './components/nexodev/Elements.js';
import { SocketIoNexodev } from './components/nexodev/SocketIoNexodev.js';
import { getProxyPath } from './components/core/VanillaJs.js';
import { HomeBackground } from './components/core/HomeBackground.js';
import { ToolBar } from './components/core/ToolBar.js';

(async function () {
  const themes = [CssNexodevLight, CssNexodev];
  await Css.loadThemes(themes, Menu);
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
  await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/earth.jpg` });
  await ToolBar.Render({
    id: 'ToolBar',
    tools: [
      {
        id: 'theme',
        themes,
      },
      {
        id: 'lang',
        langs: ['es', 'en'],
      },
    ],
  });
})();
