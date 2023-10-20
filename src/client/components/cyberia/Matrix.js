import { Responsive } from '../core/Responsive.js';
import { s, append } from '../core/VanillaJs.js';

const Matrix = {
  Data: {
    dim: 16 * 6,
    dimPaintByCell: 3,
    dimAmplitude: 6,
  },
  Render: {
    'matrix-center-square': function (container) {
      append(
        container,
        html`
          <style>
            ${css`
              .matrix-center-square {
                width: 30px;
                height: 30px;
                border: 2px solid red;
              }
            `}
          </style>
          <div class="abs center matrix-center-square"></div>
        `
      );
    },
  },
  UpdateCamera: function (gridId, element) {
    setTimeout(() => {
      const ResponsiveData = Responsive.getResponsiveData();
      const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: this.Data.dimAmplitude });
      const { x, y } = element;

      if (ResponsiveData.minType === 'height') {
        s(gridId).style.left = `${
          ResponsiveData.maxValue / 2 -
          (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
          ResponsiveDataAmplitude.minValue / this.Data.dim / 2
        }px`;
        s(gridId).style.top = `${
          ResponsiveData.minValue / 2 -
          (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
          ResponsiveDataAmplitude.minValue / this.Data.dim / 2
        }px`;
      } else {
        s(gridId).style.left = `${
          ResponsiveData.minValue / 2 -
          (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
          ResponsiveDataAmplitude.minValue / this.Data.dim / 2
        }px`;
        s(gridId).style.top = `${
          ResponsiveData.maxValue / 2 -
          (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
          ResponsiveDataAmplitude.minValue / this.Data.dim / 2
        }px`;
      }
    });
  },
};

export { Matrix };
