'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { Menu } from './components/nexodev/Menu.js';
import { RouterNexodev } from './components/nexodev/RoutesNexodev.js';

(async function () {
  await Css.Init({ theme: 'dark' });
  const RouterInstance = RouterNexodev();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  LoadRouter(RouterInstance);
})();
