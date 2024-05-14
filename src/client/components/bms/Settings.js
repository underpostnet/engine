import { BtnIcon } from '../core/BtnIcon.js';
import { Css } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Responsive } from '../core/Responsive.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { s, fullScreenIn, fullScreenOut, checkFullScreen } from '../core/VanillaJs.js';
import { Worker } from '../core/Worker.js';

const Settings = {
  Render: async function () {
    let fullScreenSwitch = checkFullScreen();
    Responsive.Event['full-screen-settings'] = () => {
      let fullScreenMode = checkFullScreen();
      if ((fullScreenSwitch && !fullScreenMode) || (!fullScreenSwitch && fullScreenMode))
        if (s('.fullscreen-toggle')) s('.fullscreen-toggle').click();
    };
    const localThemes = {
      bms: { displayName: 'Dark' },
      'bms-light': { displayName: 'Light' },
    };
    setTimeout(() => Worker.loadSettingUI());
    return html`
      <div class="in section-mp box-option">
        <div class="fl ">
          <div class="in fll" style="width: 70%">
            <div class="in"><i class="fa-solid fa-expand"></i> ${Translate.Render('fullscreen')}</div>
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

      <div class="in section-mp">
        ${await DropDown.Render({
          value: s('html').lang ? s('html').lang : 'en',
          label: html`${Translate.Render('lang')}`,
          data: ['en', 'es'].map((language) => {
            return {
              display: html`<i class="fa-solid fa-language"></i> ${Translate.Render(language)}`,
              value: language,
              onClick: () => Translate.renderLang(language),
            };
          }),
        })}
      </div>

      <div class="in section-mp">
        ${await DropDown.Render({
          value: Css.currentTheme,
          label: html`${Translate.Render('theme')}`,
          data: Object.keys(localThemes).map((theme) => {
            return {
              display: html`<i class="fa-solid fa-brush"></i> ${localThemes[theme].displayName}`,
              value: theme,
              onClick: async () => Css.renderTheme(theme),
            };
          }),
        })}
      </div>

      <div class="in">
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-install-service-controller',
          label: html`<i class="fas fa-download"></i> ${Translate.Render('Install control service')}`,
        })}
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-uninstall-service-controller',
          label: html`<i class="far fa-trash-alt"></i> ${Translate.Render('Uninstall control service')}`,
        })}
      </div>
      <div class="in">
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-reload',
          label: html`<i class="fas fa-sync-alt"></i> ${Translate.Render('Reload')}`,
        })}
      </div>
    `;
  },
};

export { Settings };
