'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterUnderpost } from './components/underpost/RoutesUnderpost.js';
import { AppShellUnderpost } from './components/underpost/AppShellUnderpost.js';
import { AppStoreUnderpost } from './components/underpost/AppStoreUnderpost.js';
import { SocketIoUnderpost } from './components/underpost/SocketIoUnderpost.js';
import { LogInUnderpost } from './components/underpost/LogInUnderpost.js';
import { LogOutUnderpost } from './components/underpost/LogOutUnderpost.js';
import { SignUpUnderpost } from './components/underpost/SignUpUnderpost.js';
import { CssUnderpostDark, CssUnderpostLight } from './components/underpost/CssUnderpost.js';
import { TranslateUnderpost } from './components/underpost/TranslateUnderpost.js';

const CssUnderpostThemes = [CssUnderpostDark, CssUnderpostLight];

window.onload = () =>
  Worker.instance({
    router: RouterUnderpost,

    themes: CssUnderpostThemes,
    translate: TranslateUnderpost,
    render: AppShellUnderpost,
    appStore: AppStoreUnderpost,

    session: {
      socket: SocketIoUnderpost,
      login: LogInUnderpost,
      signout: LogOutUnderpost,
      signup: SignUpUnderpost,
    },
  });
