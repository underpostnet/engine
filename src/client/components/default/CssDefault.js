import { subThemeManager } from '../core/Css.js';

const CssCommonDefault = async () => {
  // use  #4f46e5, #7c3aed);
  subThemeManager.setDarkTheme('#7d7d7d');
  subThemeManager.setLightTheme('#7c3aed');

  return html``;
};

const CssDefaultDark = {
  theme: 'default-dark',
  dark: true,
  render: async () => {
    return (await CssCommonDefault()) + html``;
  },
};

const CssDefaultLight = {
  theme: 'default-light',
  dark: false,
  render: async () => {
    return (await CssCommonDefault()) + html``;
  },
};

export { CssDefaultDark, CssCommonDefault, CssDefaultLight };
