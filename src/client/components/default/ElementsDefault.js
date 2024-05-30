import { loggerFactory } from '../core/Logger.js';
import { BaseElement } from './CommonDefault.js';

const logger = loggerFactory(import.meta);

const ElementsDefault = {
  Data: BaseElement(),
  Interval: {},
  LocalDataScope: {},
  Init: function (options = { type: 'user', id: 'main', element: {} }) {
    const { type, id, element } = options;
    this.Data[type][id] = {
      ...BaseElement()[type].main,
      ...this.Data[type][id],
      ...element,
    };
    if (!this.Interval[type]) this.Interval[type] = {};
    if (!this.Interval[type][id]) this.Interval[type][id] = {};
    if (!this.LocalDataScope[type]) this.LocalDataScope[type] = {};
    if (!this.LocalDataScope[type][id])
      this.LocalDataScope[type][id] = {
        path: [],
      };
  },
  removeAll: function () {
    for (const type of Object.keys(this.Data)) {
      for (const id of Object.keys(this.Data[type])) {
        if (this.Interval[type] && this.Interval[type][id]) {
          for (const interval of Object.keys(this.Interval[type][id])) clearInterval(this.Interval[type][id][interval]);
        }
      }
    }
    this.Interval = {};
    this.Data = BaseElement();
  },
};

export { ElementsDefault };
