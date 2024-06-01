'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInBms } from './components/bms/LogInBms.js';
import { LogOutBms } from './components/bms/LogOutBms.js';
import { SignUpBms } from './components/bms/SignUpBms.js';
import { MenuBms } from './components/bms/MenuBms.js';
import { RouterBms } from './components/bms/RoutesBms.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsBms } from './components/bms/ElementsBms.js';
import { SocketIoBms } from './components/bms/SocketIoBms.js';
import { getProxyPath } from './components/core/VanillaJs.js';
import { HomeBackground } from './components/core/HomeBackground.js';
import { Worker } from './components/core/Worker.js';
Worker.instance({
  router: RouterBms,
  render: async () => {
    await Css.loadThemes();
    await TranslateCore.Init();
    await Responsive.Init();
    await MenuBms.Render();
    await SocketIo.Init({ channels: ElementsBms.Data });
    await SocketIoBms.Init();
    await LogInBms();
    await LogOutBms();
    await SignUpBms();
    await HomeBackground.Render({ imageSrc: `${getProxyPath()}assets/background/white0.jpg` });
  },
});
