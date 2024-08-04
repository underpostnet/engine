import { Responsive } from './Responsive.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { checkFullScreen, fullScreenIn, fullScreenOut, s } from './VanillaJs.js';

const FullScreen = {
  RenderSetting: async function () {
    let fullScreenSwitch = checkFullScreen();
    Responsive.Event['full-screen-settings'] = () => {
      let fullScreenMode = checkFullScreen();
      if ((fullScreenSwitch && !fullScreenMode) || (!fullScreenSwitch && fullScreenMode))
        if (s('.fullscreen-toggle')) ToggleSwitch.Tokens[`fullscreen-toggle`].click();
    };
    setTimeout(
      () => (s(`.toggle-form-container-fullscreen`).onclick = () => ToggleSwitch.Tokens[`fullscreen-toggle`].click()),
    );
    return html`<div class="in section-mp toggle-form-container toggle-form-container-fullscreen hover">
      <div class="fl ">
        <div class="in fll" style="width: 70%">
          <div class="in"><i class="fa-solid fa-expand"></i> ${Translate.Render('fullscreen')}</div>
        </div>
        <div class="in fll" style="width: 30%">
          ${await ToggleSwitch.Render({
            id: 'fullscreen-toggle',
            containerClass: 'inl',
            disabledOnClick: true,
            checked: fullScreenSwitch,
            on: {
              unchecked: () => {
                fullScreenSwitch = false;
                if (checkFullScreen()) fullScreenOut();
              },
              checked: () => {
                fullScreenSwitch = true;
                if (!checkFullScreen()) fullScreenIn();
              },
            },
          })}
        </div>
      </div>
    </div>`;
  },
};

export { FullScreen };
