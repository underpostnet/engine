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
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { DefaultParams } from './components/default/CommonDefault.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoDefault } from './components/default/SocketIoDefault.js';
import { ElementsDefault } from './components/default/ElementsDefault.js';
import { Scroll } from './components/core/Scroll.js';
import { CssDefaultDark, CssDefaultLight } from './components/default/CssDefault.js';

const htmlMainBody = async () => {
  return html`<span>Hello World!!</span>`;
};

window.onload = () =>
  Worker.instance({
    router: RouterDefault,
    render: async () => {
      await Css.loadThemes([CssDefaultLight, CssDefaultDark]);
      await TranslateCore.Init();
      await TranslateDefault.Init();
      await Responsive.Init();
      await MenuDefault.Render({ htmlMainBody });
      await SocketIo.Init({
        channels: ElementsDefault.Data,
        path: `/`,
      });
      await SocketIoDefault.Init();
      await LogInDefault();
      await LogOutDefault();
      await SignUpDefault();
      await Scroll.pullTopRefresh();
      await Keyboard.Init({ callBackTime: DefaultParams.EVENT_CALLBACK_TIME });
    },
  });
