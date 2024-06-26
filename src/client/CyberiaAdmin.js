import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { disableOptionsClick } from './components/core/VanillaJs.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { LogOutCyberia } from './components/cyberia/LogOutCyberia.js';
import { TranslateCore } from './components/core/Translate.js';
import { RouterCyberia } from './components/cyberia/RoutesCyberia.js';
import { Css } from './components/core/Css.js';
import { CssCyberiaDark } from './components/cyberia/CssCyberia.js';
import { SignUpCyberia } from './components/cyberia/SignUpCyberia.js';
import { CyberiaParams } from './components/cyberia/CommonCyberia.js';
import { Worker } from './components/core/Worker.js';
import { MenuAdminCyberia } from './components/cyberia/MenuAdminCyberia.js';

window.onload = () =>
  Worker.instance({
    router: RouterCyberia,
    render: async () => {
      await Css.loadThemes([CssCyberiaDark]);
      await TranslateCore.Init();
      await TranslateCyberia.Init();
      await Responsive.Init();
      await MenuAdminCyberia.Render();
      await LogOutCyberia();
      await SignUpCyberia();
      disableOptionsClick('html', ['drag', 'select', 'menu']);
      await Keyboard.Init({ callBackTime: CyberiaParams.EVENT_CALLBACK_TIME });
    },
  });
