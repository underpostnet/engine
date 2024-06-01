import { Css } from '../core/Css.js';
import { FullScreen } from '../core/FullScreen.js';
import { Translate } from '../core/Translate.js';
import { Worker } from '../core/Worker.js';

const SettingsCyberia = {
  Render: async function () {
    let render = await FullScreen.RenderSetting();
    render += await Css.RenderSetting();
    render += await Translate.RenderSetting();
    render += await Worker.RenderSetting();
    return render;
  },
};

export { SettingsCyberia };
