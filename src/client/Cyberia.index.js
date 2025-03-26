import { SocketIo } from './components/core/SocketIo.js';
import { Responsive } from './components/core/Responsive.js';
import { Keyboard } from './components/core/Keyboard.js';
import { disableOptionsClick, htmls, s } from './components/core/VanillaJs.js';
import { PixiCyberia } from './components/cyberia/PixiCyberia.js';
import { ElementsCyberia } from './components/cyberia/ElementsCyberia.js';
import { TranslateCyberia } from './components/cyberia/TranslateCyberia.js';
import { JoyStickCyberia } from './components/cyberia/JoyStickCyberia.js';
import { MainUserCyberia } from './components/cyberia/MainUserCyberia.js';
import { SocketIoCyberia } from './components/cyberia/SocketIoCyberia.js';
import { LogOutCyberia } from './components/cyberia/LogOutCyberia.js';
import { TranslateCore } from './components/core/Translate.js';
import { MenuCyberia } from './components/cyberia/MenuCyberia.js';
import { RouterCyberia } from './components/cyberia/RoutesCyberia.js';
import { Css } from './components/core/Css.js';
import { CssCyberiaDark } from './components/cyberia/CssCyberia.js';
import { SkillCyberia } from './components/cyberia/SkillCyberia.js';
import { PointAndClickMovementCyberia } from './components/cyberia/PointAndClickMovementCyberia.js';
import { SignUpCyberia } from './components/cyberia/SignUpCyberia.js';
import { InteractionPanelCyberia } from './components/cyberia/InteractionPanelCyberia.js';
import { CyberiaParams } from './components/cyberia/CommonCyberia.js';
import { Worker } from './components/core/Worker.js';
import { MatrixCyberia } from './components/cyberia/MatrixCyberia.js';

window.onload = () =>
  Worker.instance({
    router: RouterCyberia,
    render: async () => {
      await Css.loadThemes([CssCyberiaDark]);
      await MatrixCyberia.loadData();
      await TranslateCore.Init();
      await TranslateCyberia.Init();
      await MainUserCyberia.Render();
      await PixiCyberia.Init();
      await Responsive.Init();
      await MenuCyberia.Render();
      await SkillCyberia.renderMainKeysSlots();
      await PointAndClickMovementCyberia.Render();
      await InteractionPanelCyberia.Render({ id: 'menu-interaction-panel' });
      await InteractionPanelCyberia.Render({ id: 'notification-interaction-panel' });
      await SocketIo.Init({ channels: ElementsCyberia.Data });
      await SocketIoCyberia.Init();
      await LogOutCyberia();
      await SignUpCyberia();
      disableOptionsClick('html', ['drag', 'select', 'menu']);
      await Keyboard.Init({ callBackTime: CyberiaParams.EVENT_CALLBACK_TIME });
      await JoyStickCyberia.Render();
      await MatrixCyberia.Render();
      await MainUserCyberia.finishSetup();
    },
  });
