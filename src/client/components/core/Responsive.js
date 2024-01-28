import { newInstance } from './CommonJs.js';
import { getResponsiveData } from './VanillaJs.js';

const Responsive = {
  Data: {},
  Event: {},
  Observer: ResizeObserver,
  getResponsiveData: function () {
    return newInstance(this.Data);
  },
  getResponsiveDataAmplitude: function (options) {
    const { dimAmplitude } = options;
    const ResponsiveDataAmplitude = newInstance(this.Data);
    ResponsiveDataAmplitude.minValue = ResponsiveDataAmplitude.minValue * dimAmplitude;
    ResponsiveDataAmplitude.maxValue = ResponsiveDataAmplitude.maxValue * dimAmplitude;
    ResponsiveDataAmplitude.width = ResponsiveDataAmplitude.width * dimAmplitude;
    ResponsiveDataAmplitude.height = ResponsiveDataAmplitude.height * dimAmplitude;
    return ResponsiveDataAmplitude;
  },
  Init: async function () {
    this.Observer = new ResizeObserver(() => {
      const Data = getResponsiveData();
      if (Data.minValue !== this.Data.minValue || Data.maxValue !== this.Data.maxValue) {
        this.Data = Data;
        this.triggerEvents();
      }
    });
    this.Observer.observe(document.documentElement);
  },
  triggerEvents: function (keyEvent) {
    if (keyEvent) return this.Event[keyEvent]();
    return Object.keys(this.Event).map((key) => this.Event[key]());
  },
};

export { Responsive };
