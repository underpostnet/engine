'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssCryptokoyn } from './components/cryptokoyn/CssCryptokoyn.js';
import { LogInCryptokoyn } from './components/cryptokoyn/LogInCryptokoyn.js';
import { LogOutCryptokoyn } from './components/cryptokoyn/LogOutCryptokoyn.js';
import { SignUpCryptokoyn } from './components/cryptokoyn/SignUpCryptokoyn.js';
import { Menu } from './components/cryptokoyn/Menu.js';
import { RouterCryptokoyn } from './components/cryptokoyn/RoutesCryptokoyn.js';

(async function () {
  await Css.Init(CssCryptokoyn);
  const RouterInstance = RouterCryptokoyn();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await LogInCryptokoyn();
  await LogOutCryptokoyn();
  await SignUpCryptokoyn();
  LoadRouter(RouterInstance);
})();
