'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInDogmadual } from './components/dogmadual/LogInDogmadual.js';
import { LogOutDogmadual } from './components/dogmadual/LogOutDogmadual.js';
import { SignUpDogmadual } from './components/dogmadual/SignUpDogmadual.js';
import { AppShellDogmadual } from './components/dogmadual/AppShellDogmadual.js';
import { RouterDogmadual } from './components/dogmadual/RoutesDogmadual.js';
import { CssDogmadualDark, CssDogmadualLight } from './components/dogmadual/CssDogmadual.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { SocketIoDogmadual } from './components/dogmadual/SocketIoDogmadual.js';
import { SocketIo } from './components/core/SocketIo.js';
import { AppStoreDogmadual } from './components/dogmadual/AppStoreDogmadual.js';
import { getProxyPath } from './components/core/Router.js';

const htmlMainBody = async () => {
  return html`<img alt="Tech network" src="${getProxyPath()}assets/tech/tech-network.svg" />`;
};

window.onload = () =>
  Worker.instance({
    router: RouterDogmadual,
    render: async () => {
      await Css.loadThemes([CssDogmadualDark, CssDogmadualLight]);
      await TranslateCore.Init();
      await Responsive.Init();
      await AppShellDogmadual.Render({ htmlMainBody });
      await SocketIo.Init({ channels: AppStoreDogmadual.Data });
      await SocketIoDogmadual.Init();
      await LogInDogmadual();
      await LogOutDogmadual();
      await SignUpDogmadual();
      await Keyboard.Init();
    },
  });
