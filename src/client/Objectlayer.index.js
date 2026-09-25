'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterObjectlayer } from './components/objectlayer/RouterObjectlayer.js';
import { AppShellObjectlayer } from './components/objectlayer/AppShellObjectlayer.js';
import { AppStoreObjectlayer } from './components/objectlayer/AppStoreObjectlayer.js';
import { SocketIoObjectlayer } from './components/objectlayer/SocketIoObjectlayer.js';
import { LogInObjectlayer } from './components/objectlayer/LogInObjectlayer.js';
import { LogOutObjectlayer } from './components/objectlayer/LogOutObjectlayer.js';
import { SignUpObjectlayer } from './components/objectlayer/SignUpObjectlayer.js';
import { CssObjectlayerDark, CssObjectlayerLight } from './components/objectlayer/CssObjectlayer.js';
import { TranslateObjectlayer } from './components/objectlayer/TranslateObjectlayer.js';

const ObjectlayerTemplate = async () => {
  return html``;
};

const CssObjectlayerThemes = [CssObjectlayerDark, CssObjectlayerLight];

window.onload = () =>
  Worker.instance({
    router: RouterObjectlayer,
    template: ObjectlayerTemplate,
    themes: CssObjectlayerThemes,
    translate: TranslateObjectlayer,
    render: AppShellObjectlayer,
    appStore: AppStoreObjectlayer,

    session: {
      socket: SocketIoObjectlayer,
      login: LogInObjectlayer,
      signout: LogOutObjectlayer,
      signup: SignUpObjectlayer,
    },
  });
