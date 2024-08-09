'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInCryptokoyn } from './components/cryptokoyn/LogInCryptokoyn.js';
import { LogOutCryptokoyn } from './components/cryptokoyn/LogOutCryptokoyn.js';
import { SignUpCryptokoyn } from './components/cryptokoyn/SignUpCryptokoyn.js';
import { MenuCryptokoyn } from './components/cryptokoyn/MenuCryptokoyn.js';
import { RouterCryptokoyn } from './components/cryptokoyn/RoutesCryptokoyn.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { CryptokoynParams } from './components/cryptokoyn/CommonCryptokoyn.js';

window.onload = () =>
  Worker.instance({
    router: RouterCryptokoyn,
    render: async () => {
      await Css.loadThemes();
      await TranslateCore.Init();
      await Responsive.Init();
      await MenuCryptokoyn.Render();
      await LogInCryptokoyn();
      await LogOutCryptokoyn();
      await SignUpCryptokoyn();
      await Keyboard.Init({ callBackTime: CryptokoynParams.EVENT_CALLBACK_TIME });
    },
  });
