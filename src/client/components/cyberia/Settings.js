import { BtnIcon } from '../core/BtnIcon.js';
import { Css, Themes } from '../core/Css.js';
import { DropDown } from '../core/DropDown.js';
import { EventsUI } from '../core/EventsUI.js';
import { Responsive } from '../core/Responsive.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { s, fullScreenIn, fullScreenOut, checkFullScreen } from '../core/VanillaJs.js';

const Settings = {
  Render: async function () {
    let fullScreenSwitch = checkFullScreen();
    Responsive.Event['full-screen-settings'] = () => {
      let fullScreenMode = checkFullScreen();
      if ((fullScreenSwitch && !fullScreenMode) || (!fullScreenSwitch && fullScreenMode))
        s('.fullscreen-toggle').click();
    };
    setTimeout(() => {
      EventsUI.onClick(`.btn-install-service-controller`, async (e) => {
        e.preventDefault();
      });
      EventsUI.onClick(`.btn-uninstall-service-controller`, async (e) => {
        e.preventDefault();
      });
      EventsUI.onClick(`.btn-reload`, async (e) => {
        e.preventDefault();
        location.reload();
      });
    });
    return html`
      <div class="in section-mp">
        <div class="in section-mp">
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
      </div>

      <div class="in section-mp">
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

      <div class="in section-mp">
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

      <div class="in">
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-install-service-controller',
          label: html`<i class="fas fa-download"></i> ${Translate.Render('Install control service')}`,
        })}
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-uninstall-service-controller',
          label: html`<i class="far fa-trash-alt"></i> ${Translate.Render('Uninstall control service')}`,
          style: 'display: none',
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
