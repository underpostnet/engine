'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInItemledger } from './components/itemledger/LogInItemledger.js';
import { LogOutItemledger } from './components/itemledger/LogOutItemledger.js';
import { SignUpItemledger } from './components/itemledger/SignUpItemledger.js';
import { MenuItemledger } from './components/itemledger/MenuItemledger.js';
import { RouterItemledger } from './components/itemledger/RoutesItemledger.js';
import { TranslateItemledger } from './components/itemledger/TranslateItemledger.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { ItemledgerParams } from './components/itemledger/CommonItemledger.js';
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoItemledger } from './components/itemledger/SocketIoItemledger.js';
import { ElementsItemledger } from './components/itemledger/ElementsItemledger.js';

const htmlMainBody = async () => {
  return html``;
};

window.onload = () =>
  Worker.instance({
    router: RouterItemledger,
    render: async () => {
      await Css.loadThemes();
      await TranslateCore.Init();
      await TranslateItemledger.Init();
      await Responsive.Init();
      await MenuItemledger.Render({ htmlMainBody });
      await SocketIo.Init({ channels: ElementsItemledger.Data });
      await SocketIoItemledger.Init();
      await LogInItemledger();
      await LogOutItemledger();
      await SignUpItemledger();
      await Keyboard.Init({ callBackTime: ItemledgerParams.EVENT_CALLBACK_TIME });
    },
  });
