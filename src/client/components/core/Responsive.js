import { newInstance } from './CommonJs.js';
import { getResponsiveData } from './VanillaJs.js';

const Responsive = {
  Data: {},
  Event: {},
  getResponsiveData: function () {
    return newInstance(this.Data);
  },
  getResponsiveDataAmplitude: function (options) {
    const { dimAmplitude } = options;
    const ResponsiveDataAmplitude = newInstance(this.Data);
    ResponsiveDataAmplitude.minValue = ResponsiveDataAmplitude.minValue * dimAmplitude;
    ResponsiveDataAmplitude.maxValue = ResponsiveDataAmplitude.maxValue * dimAmplitude;
    return ResponsiveDataAmplitude;
  },
  Init: function (options) {
    const { globalTimeInterval } = options;
    setTimeout(() => {
      this.CallBack = () => {
        const Data = getResponsiveData();
        if (Data.minValue !== this.Data.minValue || Data.maxValue !== this.Data.maxValue) {
          this.Data = Data;
          Object.keys(this.Event).map((key) => this.Event[key]());
        }
      };
      this.CallBack();
      this.Interval = setInterval(() => this.CallBack(), globalTimeInterval);
    });
  },
};

export { Responsive };
