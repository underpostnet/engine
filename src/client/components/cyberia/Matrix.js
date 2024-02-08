import { Responsive } from '../core/Responsive.js';
import { s, append } from '../core/VanillaJs.js';
import { CyberiaBaseMatrix, CyberiaParams } from './CommonCyberia.js';
import { Elements } from './Elements.js';

const Matrix = {
  Data: {
    ...CyberiaBaseMatrix(),
    biomeDataId: '',
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
        `,
      );
    },
  },
  InitCamera: async function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    if (!Elements.Interval[type][id]['camera']) {
      await this.UpdateCamera('.pixi-canvas', Elements.Data[type][id]);
      Elements.Interval[type][id]['camera'] = setInterval(async () => {
        await this.UpdateCamera('.pixi-canvas', Elements.Data[type][id]);
      }, CyberiaParams.CYBERIA_EVENT_CALLBACK_TIME);
    }
  },
  UpdateAdjacentLimit: function (params) {
    const { gridId, leftDimValue, topDimValue, ResponsiveDataAmplitude } = params;
    s(gridId).style.left = `${leftDimValue}px`;
    s(gridId).style.top = `${topDimValue}px`;
    for (const limitType of [
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]) {
      switch (limitType) {
        case 'top':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue - ResponsiveDataAmplitude.minValue}px`;
          break;
        case 'bottom':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue + ResponsiveDataAmplitude.minValue}px`;
          break;
        case 'left':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue - ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue}px`;
          break;
        case 'right':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue + ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue}px`;
          break;
        case 'top-left':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue - ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue - ResponsiveDataAmplitude.minValue}px`;
          break;
        case 'top-right':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue + ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue - ResponsiveDataAmplitude.minValue}px`;
          break;
        case 'bottom-left':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue - ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue + ResponsiveDataAmplitude.minValue}px`;
          break;
        case 'bottom-right':
          s(`.adjacent-map-limit-${limitType}`).style.left = `${leftDimValue + ResponsiveDataAmplitude.minValue}px`;
          s(`.adjacent-map-limit-${limitType}`).style.top = `${topDimValue + ResponsiveDataAmplitude.minValue}px`;
          break;
        default:
          break;
      }
    }
  },
  UpdateCamera: async function (gridId, element) {
    const ResponsiveData = Responsive.getResponsiveData();
    const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: this.Data.dimAmplitude });
    const { x, y } = element;

    if (ResponsiveData.minType === 'height') {
      const leftDimValue =
        ResponsiveData.maxValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      const topDimValue =
        ResponsiveData.minValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      this.UpdateAdjacentLimit({ gridId, leftDimValue, topDimValue, ResponsiveDataAmplitude });
    } else {
      const leftDimValue =
        ResponsiveData.minValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      const topDimValue =
        ResponsiveData.maxValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      this.UpdateAdjacentLimit({ gridId, leftDimValue, topDimValue, ResponsiveDataAmplitude });
    }
  },
};

export { Matrix };
