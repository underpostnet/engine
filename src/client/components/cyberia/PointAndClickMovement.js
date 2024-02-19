import { Responsive } from '../core/Responsive.js';
import { append, s } from '../core/VanillaJs.js';
import { Matrix } from './Matrix.js';

const PointAndClickMovement = {
  callback: null,
  Render: async function () {
    const id = `PointAndClickMovement`;
    append('body', html` <div class="abs ${id}-container"></div> `);
    this[`callback`] = () => {
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: Matrix.Data.dimAmplitude });
      // const ResponsiveData = Responsive.getResponsiveData();
      s(`.${id}-container`).style.width = `${ResponsiveDataAmplitude.minValue}px`;
      s(`.${id}-container`).style.height = `${ResponsiveDataAmplitude.minValue}px`;
    };
    this[`callback`]();
    Responsive.Event[id] = this[`callback`];
    s(`.${id}-container`).onclick = (e = new PointerEvent()) => {
      console.log(e);
      append(
        `.${id}-container`,
        html`
          <div
            class="abs marker"
            style="background: red; width: 20px; height: 20px; top: ${e.offsetY}px; left: ${e.offsetX}px"
          ></div>
        `,
      );
    };
  },
};

export { PointAndClickMovement };
