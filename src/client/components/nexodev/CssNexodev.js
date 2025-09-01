import { CalendarCore } from '../core/CalendarCore.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';

const CssCommonNexodev = async () => {
  LoadingAnimation.setLightColor(`#800080`);
  CalendarCore.RenderStyle();
  return html``;
};

const CssNexodevDark = {
  themePair: 'nexodev-light',
  theme: 'nexodev-dark',
  dark: true,
  render: CssCommonNexodev,
};
const CssNexodevLight = {
  themePair: 'nexodev-dark',
  theme: 'nexodev-light',
  dark: false,
  render: CssCommonNexodev,
};

export { CssNexodevDark, CssNexodevLight, CssCommonNexodev };
