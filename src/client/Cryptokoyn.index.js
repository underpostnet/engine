'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterCryptokoyn } from './components/cryptokoyn/RoutesCryptokoyn.js';
import { AppShellCryptokoyn } from './components/cryptokoyn/AppShellCryptokoyn.js';
import { AppStoreCryptokoyn } from './components/cryptokoyn/AppStoreCryptokoyn.js';
import { SocketIoCryptokoyn } from './components/cryptokoyn/SocketIoCryptokoyn.js';
import { LogInCryptokoyn } from './components/cryptokoyn/LogInCryptokoyn.js';
import { LogOutCryptokoyn } from './components/cryptokoyn/LogOutCryptokoyn.js';
import { SignUpCryptokoyn } from './components/cryptokoyn/SignUpCryptokoyn.js';
import { CssCryptokoynDark, CssCryptokoynLight } from './components/cryptokoyn/CssCryptokoyn.js';

const CssCryptokoynThemes = [CssCryptokoynDark, CssCryptokoynLight];

window.onload = () =>
  Worker.instance({
    router: RouterCryptokoyn,

    themes: CssCryptokoynThemes,

    render: AppShellCryptokoyn,
    appStore: AppStoreCryptokoyn,

    session: {
      socket: SocketIoCryptokoyn,
      login: LogInCryptokoyn,
      signout: LogOutCryptokoyn,
      signup: SignUpCryptokoyn,
    },
  });
