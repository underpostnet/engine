import { newInstance } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { getResponsiveData } from './VanillaJs.js';
const logger = loggerFactory(import.meta);
class Responsive {
  static Data = {};
  static Event = {};
  static DelayEvent = {};
  static Observer = ResizeObserver;
  static getResponsiveData() {
    return newInstance(Responsive.Data);
  }
  static getResponsiveDataAmplitude(options) {
    const { dimAmplitude } = options;
    const ResponsiveDataAmplitude = newInstance(Responsive.Data);
    ResponsiveDataAmplitude.minValue = ResponsiveDataAmplitude.minValue * dimAmplitude;
    ResponsiveDataAmplitude.maxValue = ResponsiveDataAmplitude.maxValue * dimAmplitude;
    ResponsiveDataAmplitude.width = ResponsiveDataAmplitude.width * dimAmplitude;
    ResponsiveDataAmplitude.height = ResponsiveDataAmplitude.height * dimAmplitude;
    return ResponsiveDataAmplitude;
  }
  static resizeCallback(force) {
    const Data = getResponsiveData();
    if (force === true || Data.minValue !== Responsive.Data.minValue || Data.maxValue !== Responsive.Data.maxValue) {
      Responsive.Data = Data;
      Responsive.triggerEvents();
    }
  }
  static resize = 0;
  static async Init() {
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
    // Check if screen.orientation is available before adding event listener
    if (
      typeof screen !== 'undefined' &&
      screen.orientation &&
      typeof screen.orientation.addEventListener === 'function'
    ) {
      screen.orientation.addEventListener('change', (event) => {
        const type = event.target.type; // landscape-primary | portrait-primary
        const angle = event.target.angle; // 90 degrees.
        logger.info(`ScreenOrientation change: ${type}, ${angle} degrees.`);
        setTimeout(() => window.onresize({}, true));
        Responsive.triggerEventsOrientation();
      });
    }
    Responsive.matchMediaOrientationInstance = matchMedia('screen and (orientation:portrait)');
    Responsive.matchMediaOrientationInstance.onchange = (e) => {
      console.log('orientation change', Responsive.matchMediaOrientationInstance.matches ? 'portrait' : 'landscape');
      // though beware square will be marked as landscape here,
      // if you want to handle this special case
      // create an other mediaquery (orientation:landscape)
      setTimeout(() => window.onresize({}, true));
      Responsive.triggerEventsOrientation();
    };
  }
  static triggerEventsOrientation() {
    for (const event of Object.keys(Responsive.orientationEvent)) Responsive.orientationEvent[event]();
    setTimeout(() => {
      window.onresize();
      for (const event of Object.keys(Responsive.orientationDelayEvent)) Responsive.orientationDelayEvent[event]();
    }, 1500);
  }
  static triggerEvents(keyEvent) {
    if (keyEvent) return Responsive.Event[keyEvent]();
    return Object.keys(Responsive.Event).map((key) => Responsive.Event[key]());
  }
  static orientationEvent = {};
  static orientationDelayEvent = {};
}
export { Responsive };
