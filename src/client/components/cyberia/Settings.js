import { Css, Themes } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { FullScreen } from '../core/FullScreen.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { s, fullScreenIn, fullScreenOut, checkFullScreen } from '../core/VanillaJs.js';

const Settings = {
  Render: async function () {
    let fullScreenSwitch = checkFullScreen();
    FullScreen.Event['full-screen-settings'] = (fullScreenMode) => {
      if ((fullScreenSwitch && !fullScreenMode) || (!fullScreenSwitch && fullScreenMode))
        s('.fullscreen-toggle').click();
    };
    return html`
      <div class="in section-row">
        <div class="fl ">
          <div class="in fll" style="width: 70%">
            <div class="in">${Translate.Render('fullscreen')}</div>
          </div>
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

      <div class="in section-row">
        ${await DropDown.Render({
          value: s('html').lang ? s('html').lang : 'en',
          label: html`${Translate.Render('lang')}`,
          data: ['en', 'es'].map((language) => {
            return {
              display: html`<i class="fa-solid fa-language"></i> ${Translate.Render(language)}`,
              value: language,
              onClick: () => {
                localStorage.setItem('lang', language);
                return Translate.Parse(language);
              },
            };
          }),
        })}
      </div>

      <div class="in section-row">
        ${await DropDown.Render({
          value: Css.currentTheme,
          label: html`${Translate.Render('theme')}`,
          data: Object.keys(Themes).map((theme) => {
            return {
              display: html`<i class="fa-solid fa-brush"></i> ${theme}`,
              value: theme,
              onClick: async () => await Themes[theme](),
            };
          }),
        })}
      </div>
    `;
  },
};

export { Settings };
