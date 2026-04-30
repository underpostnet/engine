'use strict';

import { Css, darkTheme, ThemeEvents } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInItemledger } from './components/itemledger/LogInItemledger.js';
import { LogOutItemledger } from './components/itemledger/LogOutItemledger.js';
import { SignUpItemledger } from './components/itemledger/SignUpItemledger.js';
import { AppShellItemledger } from './components/itemledger/AppShellItemledger.js';
import { RouterItemledger } from './components/itemledger/RoutesItemledger.js';
import { TranslateItemledger } from './components/itemledger/TranslateItemledger.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoItemledger } from './components/itemledger/SocketIoItemledger.js';
import { AppStoreItemledger } from './components/itemledger/AppStoreItemledger.js';
import { CssItemledgerDark, CssItemledgerLight } from './components/itemledger/CssItemledger.js';
import { s } from './components/core/VanillaJs.js';
import { EventsUI } from './components/core/EventsUI.js';

const htmlMainBody = async () => {
  return html``;
};

window.onload = () =>
  Worker.instance({
    router: RouterItemledger,
    render: async () => {
      await Css.loadThemes([CssItemledgerLight, CssItemledgerDark]);
      await TranslateCore.Init();
      await TranslateItemledger.Init();
      await Responsive.Init();
      await AppShellItemledger.Render({ htmlMainBody });
      await SocketIo.Init({ channels: AppStoreItemledger.Data });
      await SocketIoItemledger.Init();
      await LogInItemledger();
      await LogOutItemledger();
      await SignUpItemledger();
      await Keyboard.Init();
    },
  });
