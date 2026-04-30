import { CalendarCore } from '../core/CalendarCore.js';
import { subThemeManager } from '../core/Css.js';

const CssCommonNexodev = async () => {
  subThemeManager.setLightTheme(`#800080`);
  subThemeManager.setDarkTheme(`#e600e6`);
  CalendarCore.RenderStyle();
  return html``;
};

class CssNexodevDark {
  static themePair = 'nexodev-light';
  static theme = 'nexodev-dark';
  static dark = true;
  static render = CssCommonNexodev;
}
class CssNexodevLight {
  static themePair = 'nexodev-dark';
  static theme = 'nexodev-light';
  static dark = false;
  static render = CssCommonNexodev;
}

export { CssNexodevDark, CssNexodevLight, CssCommonNexodev };
