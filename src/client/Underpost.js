'use strict';

import { Css } from './components/core/Css.js';
import { Responsive } from './components/core/Responsive.js';
import { TranslateCore } from './components/core/Translate.js';
import { LogInUnderpost } from './components/underpost/LogInUnderpost.js';
import { LogOutUnderpost } from './components/underpost/LogOutUnderpost.js';
import { SignUpUnderpost } from './components/underpost/SignUpUnderpost.js';
import { Menu } from './components/underpost/Menu.js';
import { RouterUnderpost } from './components/underpost/RoutesUnderpost.js';
import { TranslateUnderpost } from './components/underpost/TranslateUnderpost.js';
import { Worker } from './components/core/Worker.js';

Worker.instance({
  router: RouterUnderpost,
  render: async () => {
    await Css.loadThemes();
    await TranslateCore.Init();
    await TranslateUnderpost.Init();
    await Responsive.Init();
    await Menu.Render();
    await LogInUnderpost();
    await LogOutUnderpost();
    await SignUpUnderpost();
  },
});
