'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterDogmadual } from './components/dogmadual/RoutesDogmadual.js';
import { AppShellDogmadual } from './components/dogmadual/AppShellDogmadual.js';
import { AppStoreDogmadual } from './components/dogmadual/AppStoreDogmadual.js';
import { SocketIoDogmadual } from './components/dogmadual/SocketIoDogmadual.js';
import { LogInDogmadual } from './components/dogmadual/LogInDogmadual.js';
import { LogOutDogmadual } from './components/dogmadual/LogOutDogmadual.js';
import { SignUpDogmadual } from './components/dogmadual/SignUpDogmadual.js';
import { CssDogmadualDark, CssDogmadualLight } from './components/dogmadual/CssDogmadual.js';

import { getProxyPath } from './components/core/Router.js';
const DogmadualTemplate = async () => {
  return html`<img alt="Tech network" src="${getProxyPath()}assets/tech/tech-network.svg" />`;
};

const CssDogmadualThemes = [CssDogmadualDark, CssDogmadualLight];

window.onload = () =>
  Worker.instance({
    router: RouterDogmadual,
    template: DogmadualTemplate,
    themes: CssDogmadualThemes,

    render: AppShellDogmadual,
    appStore: AppStoreDogmadual,

    session: {
      socket: SocketIoDogmadual,
      login: LogInDogmadual,
      signout: LogOutDogmadual,
      signup: SignUpDogmadual,
    },
  });
