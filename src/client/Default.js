'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInDefault } from './components/default/LogInDefault.js';
import { LogOutDefault } from './components/default/LogOutDefault.js';
import { SignUpDefault } from './components/default/SignUpDefault.js';
import { MenuDefault } from './components/default/MenuDefault.js';
import { RouterDefault } from './components/default/RoutesDefault.js';
import { TranslateDefault } from './components/default/TranslateDefault.js';
import { HomeBackground } from './components/core/HomeBackground.js';
import { getProxyPath } from './components/core/VanillaJs.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { DefaultParams } from './components/default/CommonDefault.js';

window.onload = () =>
  Worker.instance({
    router: RouterDefault,
    render: async () => {
      await Css.loadThemes();
      await TranslateCore.Init();
      await TranslateDefault.Init();
      await Responsive.Init();
      await MenuDefault.Render();
      await LogInDefault();
      await LogOutDefault();
      await SignUpDefault();
      await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
      await Keyboard.Init({ callBackTime: DefaultParams.EVENT_CALLBACK_TIME });
    },
  });
