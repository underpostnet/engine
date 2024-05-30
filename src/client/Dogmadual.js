'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInDogmadual } from './components/dogmadual/LogInDogmadual.js';
import { LogOutDogmadual } from './components/dogmadual/LogOutDogmadual.js';
import { SignUpDogmadual } from './components/dogmadual/SignUpDogmadual.js';
import { Menu } from './components/dogmadual/Menu.js';
import { RouterDogmadual } from './components/dogmadual/RoutesDogmadual.js';
import { CssDogmadualDark, CssDogmadualLight } from './components/dogmadual/CssDogmadual.js';

(async function () {
  await Css.loadThemes([CssDogmadualDark, CssDogmadualLight]);
  const RouterInstance = RouterDogmadual();
  await TranslateCore.Init();
  await Responsive.Init();
  await Menu.Render();
  await LogInDogmadual();
  await LogOutDogmadual();
  await SignUpDogmadual();
  LoadRouter(RouterInstance);
})();
