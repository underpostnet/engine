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
    return html`
      ${await ToggleSwitch.Render({
        wrapper: true,
        wrapperLabel: html`<i class="fa-solid fa-expand"></i> ${Translate.Render('fullscreen')}`,
        id: 'fullscreen',
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
    `;
  },
};

export { FullScreen };
