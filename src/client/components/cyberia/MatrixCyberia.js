import { Responsive } from '../core/Responsive.js';
import { s, append } from '../core/VanillaJs.js';
import { BaseMatrixCyberia, CyberiaParams } from './CommonCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';

const MatrixCyberia = {
  Data: {
    ...BaseMatrixCyberia(),
    biomeDataId: '',
  },
  Render: async function () {
    let start;
    const frame = (timeStamp) => {
      if (start === undefined || timeStamp - start >= 35) {
        start = timeStamp;
        this.UpdateAllCamera();
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
  UpdateAllCamera: async function (options = { type: 'user', id: 'main' }) {
    const { type, id } = options;
    this.UpdateCamera('.pixi-canvas', ElementsCyberia.Data[type][id], true);
    this.UpdateCamera('.pixi-canvas-top-level', ElementsCyberia.Data[type][id], true);
    this.UpdateCamera('.PointAndClickMovementCyberia-container', ElementsCyberia.Data[type][id]);
  },
  UpdateAdjacentLimit: function (params) {
    const { leftDimValue, topDimValue, ResponsiveDataAmplitude } = params;
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
  UpdateCamera: async function (gridId, element, adjacent = false) {
    const ResponsiveData = Responsive.getResponsiveData();
    const ResponsiveDataAmplitude = Responsive.getResponsiveDataAmplitude({ dimAmplitude: this.Data.dimAmplitude });
    const { x, y } = element;
    let leftDimValue, topDimValue;
    if (ResponsiveData.minType === 'height') {
      leftDimValue =
        ResponsiveData.maxValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      topDimValue =
        ResponsiveData.minValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
    } else {
      leftDimValue =
        ResponsiveData.minValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * x -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
      topDimValue =
        ResponsiveData.maxValue / 2 -
        (ResponsiveDataAmplitude.minValue / this.Data.dim) * y -
        ResponsiveDataAmplitude.minValue / this.Data.dim / 2 +
        (ResponsiveDataAmplitude.minValue / this.Data.dim / 2) * (1 - element.dim);
    }
    if (s(gridId)) {
      s(gridId).style.left = `${leftDimValue}px`;
      s(gridId).style.top = `${topDimValue}px`;
      if (adjacent) this.UpdateAdjacentLimit({ gridId, leftDimValue, topDimValue, ResponsiveDataAmplitude });
    }
  },
};

export { MatrixCyberia };
