import { LoadingAnimation } from '../core/LoadingAnimation.js';

const CssCommonUnderpost = async () => {
  LoadingAnimation.setDarkColor('#f70808');
  LoadingAnimation.setLightColor('#aa0000');

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
