'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInHealthcare } from './components/healthcare/LogInHealthcare.js';
import { LogOutHealthcare } from './components/healthcare/LogOutHealthcare.js';
import { SignUpHealthcare } from './components/healthcare/SignUpHealthcare.js';
import { MenuHealthcare } from './components/healthcare/MenuHealthcare.js';
import { RouterHealthcare } from './components/healthcare/RoutesHealthcare.js';
import { SocketIo } from './components/core/SocketIo.js';
import { ElementsHealthcare } from './components/healthcare/ElementsHealthcare.js';
import { SocketIoHealthcare } from './components/healthcare/SocketIoHealthcare.js';
import { Worker } from './components/core/Worker.js';
import { Keyboard } from './components/core/Keyboard.js';
import { HealthcareParams } from './components/healthcare/CommonHealthcare.js';
import { CssHealthcareDark, CssHealthcareLight } from './components/healthcare/CssHealthcare.js';
import { TranslateHealthcare } from './components/healthcare/TranslateHealthcare.js';

window.onload = () =>
  Worker.instance({
    router: RouterHealthcare,
    render: async () => {
      await Css.loadThemes([CssHealthcareLight, CssHealthcareDark]);
      await TranslateCore.Init();
      await TranslateHealthcare.Init();
      await Responsive.Init();
      await MenuHealthcare.Render();
      await SocketIo.Init({ channels: ElementsHealthcare.Data });
      await SocketIoHealthcare.Init();
      await LogInHealthcare();
      await LogOutHealthcare();
      await SignUpHealthcare();
      await Keyboard.Init({ callBackTime: HealthcareParams.EVENT_CALLBACK_TIME });
    },
  });
