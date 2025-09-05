'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInCyberiaPortal } from './components/cyberia-portal/LogInCyberiaPortal.js';
import { LogOutCyberiaPortal } from './components/cyberia-portal/LogOutCyberiaPortal.js';
import { SignUpCyberiaPortal } from './components/cyberia-portal/SignUpCyberiaPortal.js';
import { MenuCyberiaPortal } from './components/cyberia-portal/MenuCyberiaPortal.js';
import { RouterCyberiaPortal } from './components/cyberia-portal/RoutesCyberiaPortal.js';
import { TranslateCyberiaPortal } from './components/cyberia-portal/TranslateCyberiaPortal.js';
import { Worker } from './components/core/Worker.js';
import { CssCyberiaDark, CssCyberiaLight } from './components/cyberia-portal/CssCyberiaPortal.js';
import { SocketIoCyberiaPortal } from './components/cyberia-portal/SocketIoCyberiaPortal.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsCyberiaPortal } from './components/cyberia-portal/ElementsCyberiaPortal.js';
import { Keyboard } from './components/core/Keyboard.js';
import { CyberiaParams } from './components/cyberia/CommonCyberia.js';

window.onload = () =>
  Worker.instance({
    router: RouterCyberiaPortal,
    render: async () => {
      await Css.loadThemes([CssCyberiaDark, CssCyberiaLight]);
      await TranslateCore.Init();
      await TranslateCyberiaPortal.Init();
      await Responsive.Init();
      await MenuCyberiaPortal.Render();
      await SocketIo.Init({ channels: ElementsCyberiaPortal.Data });
      await SocketIoCyberiaPortal.Init();
      await LogInCyberiaPortal();
      await LogOutCyberiaPortal();
      await SignUpCyberiaPortal();
      await Keyboard.Init({ callBackTime: CyberiaParams.EVENT_CALLBACK_TIME });
    },
  });
