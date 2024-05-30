import { CssCommonCyberia } from '../cyberia/CssCyberia.js';

const CssCyberiaPortalDark = {
  theme: 'cyberia-portal-dark',
  dark: true,
  render: async () => (await CssCommonCyberia()) + html` <style></style> `,
};

const CssCyberiaPortalLight = {
  theme: 'cyberia-portal-light',
  dark: false,
  render: async () => (await CssCommonCyberia()) + html` <style></style> `,
};

export { CssCyberiaPortalDark, CssCyberiaPortalLight };
