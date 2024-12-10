import { Alert } from './Alert.js';
import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

const Page404 = {
  Render: async function (options = { idModal: '' }) {
    setTimeout(() => {
      Modal.Data[options.idModal].onObserverListener['404'] = () => {
        if (s(`.container-404-${options.idModal}`))
          s(`.container-404-${options.idModal}`).style.height = `${
            s(`.${options.idModal}`).offsetHeight - Modal.headerTitleHeight
          }px`;
      };
      Modal.Data[options.idModal].onObserverListener['404']();
    });
    return html`<div class="in container-404-${options.idModal}">${await Alert.e404()}</div>`;
  },
};

export { Page404 };
