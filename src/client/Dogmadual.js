'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssDogmadual } from './components/dogmadual/CssDogmadual.js';
import { LogInDogmadual } from './components/dogmadual/LogInDogmadual.js';
import { LogOutDogmadual } from './components/dogmadual/LogOutDogmadual.js';
import { SignUpDogmadual } from './components/dogmadual/SignUpDogmadual.js';
import { Menu } from './components/dogmadual/Menu.js';
import { RouterDogmadual } from './components/dogmadual/RoutesDogmadual.js';

(async function () {
  await Css.Init(CssDogmadual);
  const RouterInstance = RouterDogmadual();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await LogInDogmadual();
  await LogOutDogmadual();
  await SignUpDogmadual();
  LoadRouter(RouterInstance);
})();
