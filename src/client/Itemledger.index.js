'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterItemledger } from './components/itemledger/RouterItemledger.js';
import { AppShellItemledger } from './components/itemledger/AppShellItemledger.js';
import { AppStoreItemledger } from './components/itemledger/AppStoreItemledger.js';
import { SocketIoItemledger } from './components/itemledger/SocketIoItemledger.js';
import { LogInItemledger } from './components/itemledger/LogInItemledger.js';
import { LogOutItemledger } from './components/itemledger/LogOutItemledger.js';
import { SignUpItemledger } from './components/itemledger/SignUpItemledger.js';
import { CssItemledgerDark, CssItemledgerLight } from './components/itemledger/CssItemledger.js';
import { TranslateItemledger } from './components/itemledger/TranslateItemledger.js';

const ItemledgerTemplate = async () => {
  return html``;
};

const CssItemledgerThemes = [CssItemledgerDark, CssItemledgerLight];

window.onload = () =>
  Worker.instance({
    router: RouterItemledger,
    template: ItemledgerTemplate,
    themes: CssItemledgerThemes,
    translate: TranslateItemledger,
    render: AppShellItemledger,
    appStore: AppStoreItemledger,

    session: {
      socket: SocketIoItemledger,
      login: LogInItemledger,
      signout: LogOutItemledger,
      signup: SignUpItemledger,
    },
  });
