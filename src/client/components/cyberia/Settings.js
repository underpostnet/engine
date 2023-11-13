import { FullScreen } from '../core/FullScreen.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { s, fullScreenIn, fullScreenOut, checkFullScreen } from '../core/VanillaJs.js';

const Settings = {
  Render: async function () {
    let fullScreenSwitch = false;
    FullScreen.Event['full-screen-settings'] = (fullScreenMode) => {
      if ((fullScreenSwitch && !fullScreenMode) || (!fullScreenSwitch && fullScreenMode))
        s('.fullscreen-toggle').click();
    };
    return html`
      <div class="in section-row">
        <div class="fl ">
          <div class="in fll" style="width: 70%">${Translate.Render('fullscreen')}</div>
          <div class="in fll" style="width: 30%">
            ${await ToggleSwitch.Render({
              id: 'fullscreen-toggle',
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
      </div>
    `;
  },
};

export { Settings };
