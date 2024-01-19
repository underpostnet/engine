import { newInstance } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { BaseElement } from './CommonCyberia.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const templateElement = BaseElement();

const Elements = {
  Data: newInstance(templateElement),
  Interval: {},
  Init: function (options = { type: 'user', id: 'main', element: {} }) {
    const { type, id, element } = options;
    this.Data[type][id] = {
      ...templateElement[type].main,
      ...this.Data[type][id],
      ...element,
    };
    if (!this.Interval[type]) this.Interval[type] = {};
    if (!this.Interval[type][id]) this.Interval[type][id] = {};
  },
  removeAll: function () {
    for (const type of Object.keys(this.Data)) {
      for (const id of Object.keys(this.Data[type])) {
        Pixi.removeElement({ type, id });
        if (this.Interval[type] && this.Interval[type][id]) {
          for (const interval of Object.keys(this.Interval[type][id])) clearInterval(this.Interval[type][id][interval]);
        }
      }
    }
    this.Interval = {};
    this.Data = BaseElement();
  },
};

export { Elements };
