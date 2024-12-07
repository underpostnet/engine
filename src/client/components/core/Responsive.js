import { newInstance } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getResponsiveData } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

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
  resizeCallback: function (force) {
    const Data = getResponsiveData();
    if (force === true || Data.minValue !== Responsive.Data.minValue || Data.maxValue !== Responsive.Data.maxValue) {
      Responsive.Data = Data;
      Responsive.triggerEvents();
    }
  },
  resize: 0,
  Init: async function () {
    Responsive.resizeCallback();
    window.onresize = (e, force) => {
      Responsive.resize++;
      const resize = Responsive.resize;
      Responsive.resizeCallback(force);
      setTimeout(() => {
        if (resize === Responsive.resize) {
          Responsive.resizeCallback(force);
          Responsive.resize = 0;
          for (const event of Object.keys(Responsive.DelayEvent)) Responsive.DelayEvent[event]();
        }
      }, 750);
    };
    // alternative option
    // this.Observer = new ResizeObserver(this.resizeCallback);
    // this.Observer.observe(document.documentElement);
    screen.orientation.addEventListener('change', (event) => {
      const type = event.target.type; // landscape-primary | portrait-primary
      const angle = event.target.angle; // 90 degrees.
      logger.info(`ScreenOrientation change: ${type}, ${angle} degrees.`);
      setTimeout(() => window.onresize({}, true));
      Responsive.triggerEventsOrientation();
    });
    Responsive.matchMediaOrientationInstance = matchMedia('screen and (orientation:portrait)');

    Responsive.matchMediaOrientationInstance.onchange = (e) => {
      console.log('orientation change', Responsive.matchMediaOrientationInstance.matches ? 'portrait' : 'landscape');
      // though beware square will be marked as landscape here,
      // if you want to handle this special case
      // create an other mediaquery (orientation:landscape)
      setTimeout(() => window.onresize({}, true));
      Responsive.triggerEventsOrientation();
    };
  },
  triggerEventsOrientation: function () {
    for (const event of Object.keys(this.orientationEvent)) this.orientationEvent[event]();
    setTimeout(() => {
      window.onresize();
      for (const event of Object.keys(this.orientationDelayEvent)) this.orientationDelayEvent[event]();
    }, 1500);
  },
  triggerEvents: function (keyEvent) {
    if (keyEvent) return this.Event[keyEvent]();
    return Object.keys(this.Event).map((key) => this.Event[key]());
  },
  orientationEvent: {},
  orientationDelayEvent: {},
};

export { Responsive };
