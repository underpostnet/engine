import { subThemeManager } from '../core/Css.js';

const CssCommonUnderpost = async () => {
  subThemeManager.setDarkTheme('#f70808');
  subThemeManager.setLightTheme('#aa0000');

  return html``;
};

const CssUnderpostDark = {
  theme: 'underpost-dark',
  dark: true,
  render: async () => {
    return (await CssCommonUnderpost()) + html``;
  },
};

const CssUnderpostLight = {
  theme: 'underpost-light',
  dark: false,
  render: async () => {
    return (await CssCommonUnderpost()) + html``;
  },
};

export { CssUnderpostDark, CssCommonUnderpost, CssUnderpostLight };
