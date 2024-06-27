import { CssCommonCyberia } from '../cyberia/CssCyberia.js';

const CssCyberiaAdminDark = {
  theme: 'cyberia-admin-dark',
  dark: true,
  render: async () => (await CssCommonCyberia()) + html` <style></style> `,
};

const CssCyberiaAdminLight = {
  theme: 'cyberia-admin-light',
  dark: false,
  render: async () => (await CssCommonCyberia()) + html` <style></style> `,
};

export { CssCyberiaAdminDark, CssCyberiaAdminLight };
