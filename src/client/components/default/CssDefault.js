import { subThemeManager } from '../core/Css.js';

const CssCommonDefault = async () => {
  // use  #4f46e5, #7c3aed);
  subThemeManager.setDarkTheme('#7c3aed');
  subThemeManager.setLightTheme('#7c3aed');

  return html``;
};

class CssDefaultDark {
  static theme = 'default-dark';
  static dark = true;
  static render = async () => {
    return (await CssCommonDefault()) + html``;
  };
}

class CssDefaultLight {
  static theme = 'default-light';
  static dark = false;
  static render = async () => {
    return (await CssCommonDefault()) + html``;
  };
}

export { CssDefaultDark, CssCommonDefault, CssDefaultLight };
