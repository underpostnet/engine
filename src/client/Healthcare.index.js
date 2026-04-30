'use strict';

import { Worker } from './components/core/Worker.js';
import { RouterHealthcare } from './components/healthcare/RouterHealthcare.js';
import { AppShellHealthcare } from './components/healthcare/AppShellHealthcare.js';
import { AppStoreHealthcare } from './components/healthcare/AppStoreHealthcare.js';
import { SocketIoHealthcare } from './components/healthcare/SocketIoHealthcare.js';
import { LogInHealthcare } from './components/healthcare/LogInHealthcare.js';
import { LogOutHealthcare } from './components/healthcare/LogOutHealthcare.js';
import { SignUpHealthcare } from './components/healthcare/SignUpHealthcare.js';
import { CssHealthcareDark, CssHealthcareLight } from './components/healthcare/CssHealthcare.js';
import { TranslateHealthcare } from './components/healthcare/TranslateHealthcare.js';

const CssHealthcareThemes = [CssHealthcareDark, CssHealthcareLight];

window.onload = () =>
  Worker.instance({
    router: RouterHealthcare,

    themes: CssHealthcareThemes,
    translate: TranslateHealthcare,
    render: AppShellHealthcare,
    appStore: AppStoreHealthcare,

    session: {
      socket: SocketIoHealthcare,
      login: LogInHealthcare,
      signout: LogOutHealthcare,
      signup: SignUpHealthcare,
    },
  });
