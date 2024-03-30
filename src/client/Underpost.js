'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssUnderpost } from './components/underpost/CssUnderpost.js';
import { LogInUnderpost } from './components/underpost/LogInUnderpost.js';
import { LogOutUnderpost } from './components/underpost/LogOutUnderpost.js';
import { SignUpUnderpost } from './components/underpost/SignUpUnderpost.js';
import { Menu } from './components/underpost/Menu.js';
import { RouterUnderpost } from './components/underpost/RoutesUnderpost.js';
import { TranslateUnderpost } from './components/underpost/TranslateUnderpost.js';

(async function () {
  await Css.Init(CssUnderpost);
  const RouterInstance = RouterUnderpost();
  await TranslateCore.Init();
  await TranslateUnderpost.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await LogInUnderpost();
  await LogOutUnderpost();
  await SignUpUnderpost();
  LoadRouter(RouterInstance);
})();
