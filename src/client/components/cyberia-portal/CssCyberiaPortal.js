import { newInstance } from '../core/CommonJs.js';
import { s } from '../core/VanillaJs.js';
import { CssCommonCyberia } from '../cyberia/CssCyberia.js';

const CssCyberiaPortalDark = {
  theme: 'cyberia-portal-dark',
  dark: true,
  render: async () => {
    return (await CssCommonCyberia()) + html` <style></style> `;
  },
};

const CssCyberiaPortalLight = {
  theme: 'cyberia-portal-light',
  dark: false,
  render: async () => {
    return (await CssCommonCyberia()) + html` <style></style> `;
  },
};

export { CssCyberiaPortalDark, CssCyberiaPortalLight };
