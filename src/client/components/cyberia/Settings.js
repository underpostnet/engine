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
            <div class="in label-default">${Translate.Render('fullscreen')}</div>
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
          head: {
            value: s('html').lang ? Translate.Render(s('html').lang) : Translate.Render('en'),
            onClick: function () {
              console.log('DropDown onClick', this.value);
            },
          },
          label: html`<div class="in label-default">${Translate.Render('lang')}</div>`,
          list: ['en', 'es'].map((language) => {
            return {
              value: Translate.Render(language),
              onClick: () => Translate.Parse(language),
            };
          }),
        })}
      </div>

      <div class="in section-row">
        ${await DropDown.Render({
          head: {
            value: Css.currentTheme,
            onClick: function () {
              console.log('DropDown onClick', this.value);
            },
          },
          label: html` <div class="in label-default">${Translate.Render('theme')}</div>`,
          list: Object.keys(Themes).map((theme) => {
            return {
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
