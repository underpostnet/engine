import { s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';
import { Matrix } from './Matrix.js';

const MainUser = {
  Render: async function () {
    setTimeout(() => {
      const dataSkin = Elements.Data.user.main.components.skin.find((skin) => skin.enabled);
      // displayId
      // position

      s(`.main-user-content`).style.width = `${Matrix.Data.dimPixel}px`;
      s(`.main-user-content`).style.height = `${Matrix.Data.dimPixel}px`;
    });
    return html` <div class="abs center main-user-content"></div> `;
  },
};

export { MainUser };
