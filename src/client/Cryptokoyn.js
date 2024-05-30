'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { LoadRouter } from './components/core/Router.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInCryptokoyn } from './components/cryptokoyn/LogInCryptokoyn.js';
import { LogOutCryptokoyn } from './components/cryptokoyn/LogOutCryptokoyn.js';
import { SignUpCryptokoyn } from './components/cryptokoyn/SignUpCryptokoyn.js';
import { Menu } from './components/cryptokoyn/Menu.js';
import { RouterCryptokoyn } from './components/cryptokoyn/RoutesCryptokoyn.js';
import { Worker } from './components/core/Worker.js';

Worker.instance({
  router: RouterCryptokoyn,
  render: async () => {
    await Css.loadThemes();
    await TranslateCore.Init();
    await Responsive.Init();
    await Menu.Render();
    await LogInCryptokoyn();
    await LogOutCryptokoyn();
    await SignUpCryptokoyn();
  },
});
