import { s } from '../core/VanillaJs.js';
import { Elements } from './Elements.js';

const MainUser = {
  Render: async function () {
    setTimeout(() => {
      const dataSkin = Elements.Data.user.main.components.skin.find((skin) => skin.enabled);
      // displayId
      // position

      // s(`.main-user-content`).style.width = `${50}px`;
      // s(`.main-user-content`).style.height = `${50}px`;
    });
    return html` <div class="abs center main-user-content"></div> `;
  },
};

export { MainUser };
