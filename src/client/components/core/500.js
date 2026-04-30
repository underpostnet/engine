import { Alert } from './Alert.js';
import { Modal } from './Modal.js';
import { s } from './VanillaJs.js';

class Page500 {
  static async Render(options = { idModal: '' }) {
    setTimeout(() => {
      Modal.Data[options.idModal].onObserverListener['500'] = () => {
        if (s(`.container-500-${options.idModal}`))
          s(`.container-500-${options.idModal}`).style.height = `${
            s(`.${options.idModal}`).offsetHeight - Modal.headerTitleHeight
          }px`;
      };
      Modal.Data[options.idModal].onObserverListener['500']();
    });
    return html`<div class="in container-500-${options.idModal}">${await Alert.e500()}</div>`;
  }
}

export { Page500 };
