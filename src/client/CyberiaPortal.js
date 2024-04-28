'use strict';

import { Css } from './components/core/Css.js';
import { NotificationManager } from './components/core/NotificationManager.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { CssCyberiaPortal, CssCyberiaPortalLight } from './components/cyberia-portal/CssCyberiaPortal.js';
import { LogInCyberiaPortal } from './components/cyberia-portal/LogInCyberiaPortal.js';
import { LogOutCyberiaPortal } from './components/cyberia-portal/LogOutCyberiaPortal.js';
import { SignUpCyberiaPortal } from './components/cyberia-portal/SignUpCyberiaPortal.js';
import { Menu } from './components/cyberia-portal/Menu.js';
import { RouterCyberiaPortal } from './components/cyberia-portal/RoutesCyberiaPortal.js';
import { TranslateCyberiaPortal } from './components/cyberia-portal/TranslateCyberiaPortal.js';
import { ToolBar } from './components/core/ToolBar.js';
import { HomeBackground } from './components/core/HomeBackground.js';
import { getProxyPath, s } from './components/core/VanillaJs.js';
import { CssCyberia } from './components/cyberia/CssCyberia.js';

(async function () {
  const themes = [CssCyberia]; // CssCyberiaPortal, CssCyberiaPortalLight
  await Css.loadThemes(themes);
  const RouterInstance = RouterCyberiaPortal();
  await TranslateCore.Init();
  await TranslateCyberiaPortal.Init();
  await Responsive.Init();
  await Menu.Render();
  await NotificationManager.RenderBoard();
  await LogInCyberiaPortal();
  await LogOutCyberiaPortal();
  await SignUpCyberiaPortal();
  LoadRouter(RouterInstance);
  // await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
  await ToolBar.Render({
    id: 'ToolBar',
    tools: [
      // {
      //   id: 'theme',
      //   themes,
      // },
      {
        id: 'lang',
        langs: ['es', 'en'],
      },
    ],
  });
  s(`.main-btn-server`).click();
})();
