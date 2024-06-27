import { Responsive } from './components/core/Responsive.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { TranslateCore } from './components/core/Translate.js';
import { Css } from './components/core/Css.js';
import { CssCyberiaDark } from './components/cyberia/CssCyberia.js';
import { Worker } from './components/core/Worker.js';
import { MenuCyberiaAdmin } from './components/cyberia-admin/MenuCyberiaAdmin.js';
import { LogInCyberiaAdmin } from './components/cyberia-admin/LogInCyberiaAdmin.js';
import { SignUpCyberiaAdmin } from './components/cyberia-admin/SignUpCyberiaAdmin.js';
import { LogOutCyberiaAdmin } from './components/cyberia-admin/LogOutCyberiaAdmin.js';
import { RouterCyberiaAdmin } from './components/cyberia-admin/RoutesCyberiaAdmin.js';

window.onload = () =>
  Worker.instance({
    router: RouterCyberiaAdmin,
    render: async () => {
      await Css.loadThemes([CssCyberiaDark]);
      await TranslateCore.Init();
      await TranslateCyberia.Init();
      await Responsive.Init();
      await MenuCyberiaAdmin.Render();
      await LogInCyberiaAdmin();
      await SignUpCyberiaAdmin();
      await LogOutCyberiaAdmin();
    },
  });
