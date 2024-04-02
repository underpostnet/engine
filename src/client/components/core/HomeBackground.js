import { Responsive } from './Responsive.js';
import { append, getProxyPath, s } from './VanillaJs.js';

const HomeBackground = {
  Render: async function (options = { imageSrc: '' }) {
    append('body', html` <img class="abs center home-background" src="${options.imageSrc}" /> `);
    Responsive.Event['home-background'] = () => {
      if (Responsive.Data.minType === 'width') {
        s(`.home-background`).style.height = `auto`;
        s(`.home-background`).style.width = `${Responsive.Data.maxValue}px`;
      }
      s(`.home-background`).style.height = `${Responsive.Data.maxValue}px`;
      s(`.home-background`).style.width = `auto`;
    };
    Responsive.Event['home-background']();
    return html` <div></div> `;
  },
};

export { HomeBackground };
