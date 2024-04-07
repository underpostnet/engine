'use strict';

import { Css, addTheme } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssBms, CssBmsLight } from './components/bms/CssBms.js';
import { LogInBms } from './components/bms/LogInBms.js';
import { LogOutBms } from './components/bms/LogOutBms.js';
import { SignUpBms } from './components/bms/SignUpBms.js';
import { Menu } from './components/bms/Menu.js';
import { RouterBms } from './components/bms/RoutesBms.js';
import { SocketIo } from './components/core/SocketIo.js';
import { Elements } from './components/bms/Elements.js';
import { SocketIoBms } from './components/bms/SocketIoBms.js';
import { getProxyPath } from './components/core/VanillaJs.js';
import { HomeBackground } from './components/core/HomeBackground.js';

(async function () {
  await Css.loadThemes([CssBms, CssBmsLight]);
  const RouterInstance = RouterBms();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await SocketIo.Init({ channels: Elements.Data });
  await SocketIoBms.Init();
  await LogInBms();
  await LogOutBms();
  await SignUpBms();
  LoadRouter(RouterInstance);
  await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
})();
