'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInUnderpost } from './components/underpost/LogInUnderpost.js';
import { LogOutUnderpost } from './components/underpost/LogOutUnderpost.js';
import { SignUpUnderpost } from './components/underpost/SignUpUnderpost.js';
import { AppShellUnderpost } from './components/underpost/AppShellUnderpost.js';
import { RouterUnderpost } from './components/underpost/RoutesUnderpost.js';
import { TranslateUnderpost } from './components/underpost/TranslateUnderpost.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { SocketIoUnderpost } from './components/underpost/SocketIoUnderpost.js';
import { SocketIo } from './components/core/SocketIo.js';
import { AppStoreUnderpost } from './components/underpost/AppStoreUnderpost.js';
import { CssUnderpostDark, CssUnderpostLight } from './components/underpost/CssUnderpost.js';

window.onload = () =>
  Worker.instance({
    router: RouterUnderpost,
    render: async () => {
      await Css.loadThemes([CssUnderpostDark, CssUnderpostLight]);
      await TranslateCore.Init();
      await TranslateUnderpost.Init();
      await Responsive.Init();
      await AppShellUnderpost.Render();
      await SocketIo.Init({ channels: AppStoreUnderpost.Data });
      await SocketIoUnderpost.Init();
      await LogInUnderpost();
      await LogOutUnderpost();
      await SignUpUnderpost();
      await Keyboard.Init();
    },
  });
