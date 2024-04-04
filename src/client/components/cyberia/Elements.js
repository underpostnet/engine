import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { BaseElement } from './CommonCyberia.js';
import { WorldManagement } from './World.js';

const logger = loggerFactory(import.meta);

const Elements = {
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
    this.Data[type][id].components = {
      ...BaseElement()[type].main.components,
      ...this.Data[type][id].components,
    };
    if (!this.Interval[type]) this.Interval[type] = {};
    if (!this.Interval[type][id]) this.Interval[type][id] = {};
    if (!this.LocalDataScope[type]) this.LocalDataScope[type] = {};
    if (!this.LocalDataScope[type][id])
      this.LocalDataScope[type][id] = {
        path: [],
      };
  },
  getDisplayName: ({ type, id }) => {
    const displayName =
      type === 'user' && Elements.Data[type][id].model.user.username
        ? Elements.Data[type][id].model.user.username
        : type === 'user' && id === 'main'
        ? SocketIo.socket.id
        : id;
    return displayName.replace(`${type}-`, '').slice(0, 7);
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
    WorldManagement.Data = {};
  },
};

export { Elements };
