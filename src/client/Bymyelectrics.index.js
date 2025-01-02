'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInBymyelectrics } from './components/bymyelectrics/LogInBymyelectrics.js';
import { LogOutBymyelectrics } from './components/bymyelectrics/LogOutBymyelectrics.js';
import { SignUpBymyelectrics } from './components/bymyelectrics/SignUpBymyelectrics.js';
import { MenuBymyelectrics } from './components/bymyelectrics/MenuBymyelectrics.js';
import { RouterBymyelectrics } from './components/bymyelectrics/RoutesBymyelectrics.js';
import { TranslateBymyelectrics } from './components/bymyelectrics/TranslateBymyelectrics.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { BymyelectricsParams } from './components/bymyelectrics/CommonBymyelectrics.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoBymyelectrics } from './components/bymyelectrics/SocketIoBymyelectrics.js';
import { ElementsBymyelectrics } from './components/bymyelectrics/ElementsBymyelectrics.js';
import { Scroll } from './components/core/Scroll.js';

const htmlMainBody = async () => {
  return html`<span style="color: black; padding: 5px">Hello World!!</span>`;
};

window.onload = () =>
  Worker.instance({
    router: RouterBymyelectrics,
    render: async () => {
      await Css.loadThemes();
      await TranslateCore.Init();
      await TranslateBymyelectrics.Init();
      await Responsive.Init();
      await MenuBymyelectrics.Render({ htmlMainBody });
      await SocketIo.Init({ channels: ElementsBymyelectrics.Data });
      await SocketIoBymyelectrics.Init();
      await LogInBymyelectrics();
      await LogOutBymyelectrics();
      await SignUpBymyelectrics();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: BymyelectricsParams.EVENT_CALLBACK_TIME });
    },
  });
