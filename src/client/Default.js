'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssDefault, CssDefaultLight } from './components/default/CssDefault.js';
import { LogInDefault } from './components/default/LogInDefault.js';
import { LogOutDefault } from './components/default/LogOutDefault.js';
import { SignUpDefault } from './components/default/SignUpDefault.js';
import { Menu } from './components/default/Menu.js';
import { RouterDefault } from './components/default/RoutesDefault.js';
import { TranslateDefault } from './components/default/TranslateDefault.js';
import { ToolBar } from './components/core/ToolBar.js';
import { HomeBackground } from './components/core/HomeBackground.js';
import { getProxyPath } from './components/core/VanillaJs.js';

(async function () {
  const themes = [CssDefaultLight, CssDefault];
  await Css.loadThemes(themes);
  const RouterInstance = RouterDefault();
  await TranslateCore.Init();
  await TranslateDefault.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await LogInDefault();
  await LogOutDefault();
  await SignUpDefault();
  LoadRouter(RouterInstance);
  await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
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
