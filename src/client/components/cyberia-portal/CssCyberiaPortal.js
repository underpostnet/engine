import { newInstance } from '../core/CommonJs.js';
import { s } from '../core/VanillaJs.js';
import { CssCommonCyberia } from '../cyberia/CssCyberia.js';

let backGroundImage;

const CssCyberiaPortalDark = {
  theme: 'cyberia-portal-dark',
  dark: true,
  render: async () => {
    s(`.ssr-background-image`).style.backgroundImage = backGroundImage;

    return (await CssCommonCyberia()) + html` <style></style> `;
  },
};

const CssCyberiaPortalLight = {
  theme: 'cyberia-portal-light',
  dark: false,
  render: async () => {
    if (!backGroundImage) backGroundImage = newInstance(s(`.ssr-background-image`).style.backgroundImage);
    s(`.ssr-background-image`).style.backgroundImage = 'none';

    return (await CssCommonCyberia()) + html` <style></style> `;
  },
};

export { CssCyberiaPortalDark, CssCyberiaPortalLight };
