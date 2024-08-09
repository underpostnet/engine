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
import { SocketIo } from './components/core/SocketIo.js';
import { SocketIoCyberiaAdmin } from './components/cyberia-admin/SocketIoCyberiaAdmin.js';
import { ElementsCyberiaAdmin } from './components/cyberia-admin/ElementsCyberiaAdmin.js';
import { CyberiaParams } from './components/cyberia/CommonCyberia.js';
import { Keyboard } from './components/core/Keyboard.js';

window.onload = () =>
  Worker.instance({
    router: RouterCyberiaAdmin,
    render: async () => {
      await Css.loadThemes([CssCyberiaDark]);
      await TranslateCore.Init();
      await TranslateCyberia.Init();
      await Responsive.Init();
      await MenuCyberiaAdmin.Render();
      await SocketIo.Init({ channels: ElementsCyberiaAdmin.Data });
      await SocketIoCyberiaAdmin.Init();
      await LogInCyberiaAdmin();
      await SignUpCyberiaAdmin();
      await LogOutCyberiaAdmin();
      await Keyboard.Init({ callBackTime: CyberiaParams.EVENT_CALLBACK_TIME });
    },
  });
