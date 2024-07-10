import { newInstance } from './CommonJs.js';
import { getResponsiveData } from './VanillaJs.js';

const Responsive = {
  Data: {},
  Event: {},
  DelayEvent: {},
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
  resizeCallback: function () {
    const Data = getResponsiveData();
    if (Data.minValue !== Responsive.Data.minValue || Data.maxValue !== Responsive.Data.maxValue) {
      Responsive.Data = Data;
      Responsive.triggerEvents();
    }
  },
  resize: 0,
  Init: async function () {
    Responsive.resizeCallback();
    window.onresize = () => {
      Responsive.resize++;
      const resize = Responsive.resize;
      Responsive.resizeCallback();
      setTimeout(() => {
        if (resize === Responsive.resize) {
          Responsive.resizeCallback();
          Responsive.resize = 0;
          for (const event of Object.keys(Responsive.DelayEvent)) Responsive.DelayEvent[event]();
        }
      }, 750);
    };
    // alternative option
    // this.Observer = new ResizeObserver(this.resizeCallback);
    // this.Observer.observe(document.documentElement);
  },
  triggerEvents: function (keyEvent) {
    if (keyEvent) return this.Event[keyEvent]();
    return Object.keys(this.Event).map((key) => this.Event[key]());
  },
};

export { Responsive };
