'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterCyberiaPortal } from './components/cyberia-portal/RoutesCyberiaPortal.js';
import { AppShellCyberiaPortal } from './components/cyberia-portal/AppShellCyberiaPortal.js';
import { AppStoreCyberiaPortal } from './components/cyberia-portal/AppStoreCyberiaPortal.js';
import { SocketIoCyberiaPortal } from './components/cyberia-portal/SocketIoCyberiaPortal.js';
import { LogInCyberiaPortal } from './components/cyberia-portal/LogInCyberiaPortal.js';
import { LogOutCyberiaPortal } from './components/cyberia-portal/LogOutCyberiaPortal.js';
import { SignUpCyberiaPortal } from './components/cyberia-portal/SignUpCyberiaPortal.js';
import { CssCyberiaDark, CssCyberiaLight } from './components/cyberia-portal/CssCyberiaPortal.js';
import { TranslateCyberiaPortal } from './components/cyberia-portal/TranslateCyberiaPortal.js';

const CssCyberiaPortalThemes = [CssCyberiaDark, CssCyberiaLight];

window.onload = () =>
  Worker.instance({
    router: RouterCyberiaPortal,

    themes: CssCyberiaPortalThemes,
    translate: TranslateCyberiaPortal,
    render: AppShellCyberiaPortal,
    appStore: AppStoreCyberiaPortal,

    session: {
      socket: SocketIoCyberiaPortal,
      login: LogInCyberiaPortal,
      signout: LogOutCyberiaPortal,
      signup: SignUpCyberiaPortal,
    },
  });
