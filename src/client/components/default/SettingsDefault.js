import { Css } from '../core/Css.js';
import { ViewModeController } from '../core/ViewModeController.js';
import { Translate } from '../core/Translate.js';
import { Worker } from '../core/Worker.js';

class SettingsDefault {
  static async instance() {
    let render = await ViewModeController.RenderSetting();
    render += await Css.RenderSetting();
    render += await Translate.RenderSetting();
    render += await Worker.RenderSetting();
    return render;
  }
}

export { SettingsDefault };
