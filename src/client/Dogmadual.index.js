'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInDogmadual } from './components/dogmadual/LogInDogmadual.js';
import { LogOutDogmadual } from './components/dogmadual/LogOutDogmadual.js';
import { SignUpDogmadual } from './components/dogmadual/SignUpDogmadual.js';
import { MenuDogmadual } from './components/dogmadual/MenuDogmadual.js';
import { RouterDogmadual } from './components/dogmadual/RoutesDogmadual.js';
import { CssDogmadualDark, CssDogmadualLight } from './components/dogmadual/CssDogmadual.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { DogmadualParams } from './components/dogmadual/CommonDogmadual.js';
import { SocketIoDogmadual } from './components/dogmadual/SocketIoDogmadual.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsDogmadual } from './components/dogmadual/ElementsDogmadual.js';

window.onload = () =>
  Worker.instance({
    router: RouterDogmadual,
    render: async () => {
      await Css.loadThemes([CssDogmadualDark, CssDogmadualLight]);
      await TranslateCore.Init();
      await Responsive.Init();
      await MenuDogmadual.Render();
      await SocketIo.Init({ channels: ElementsDogmadual.Data });
      await SocketIoDogmadual.Init();
      await LogInDogmadual();
      await LogOutDogmadual();
      await SignUpDogmadual();
      await Keyboard.Init({ callBackTime: DogmadualParams.EVENT_CALLBACK_TIME });
    },
  });
