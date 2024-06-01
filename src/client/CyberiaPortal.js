'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInCyberiaPortal } from './components/cyberia-portal/LogInCyberiaPortal.js';
import { LogOutCyberiaPortal } from './components/cyberia-portal/LogOutCyberiaPortal.js';
import { SignUpCyberiaPortal } from './components/cyberia-portal/SignUpCyberiaPortal.js';
import { MenuCyberiaPortal } from './components/cyberia-portal/MenuCyberiaPortal.js';
import { RouterCyberiaPortal } from './components/cyberia-portal/RoutesCyberiaPortal.js';
import { TranslateCyberiaPortal } from './components/cyberia-portal/TranslateCyberiaPortal.js';
import { Worker } from './components/core/Worker.js';
import { CssCyberiaPortalDark, CssCyberiaPortalLight } from './components/cyberia-portal/CssCyberiaPortal.js';

Worker.instance({
  router: RouterCyberiaPortal,
  render: async () => {
    await Css.loadThemes([CssCyberiaPortalDark, CssCyberiaPortalLight]);
    await TranslateCore.Init();
    await TranslateCyberiaPortal.Init();
    await Responsive.Init();
    await MenuCyberiaPortal.Render();
    await LogInCyberiaPortal();
    await LogOutCyberiaPortal();
    await SignUpCyberiaPortal();
    // await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
  },
});
