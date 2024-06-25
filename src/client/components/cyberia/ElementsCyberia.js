import { cap } from '../core/CommonJs.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { BaseElement } from './CommonCyberia.js';
import { WorldCyberiaManagement } from './WorldCyberia.js';

const logger = loggerFactory(import.meta);

const ElementsCyberia = {
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
  getCurrentSkinDisplayId: function ({ type, id }) {
    const dataSkin = this.Data[type][id].components.skin.find((s) => s.current);
    return dataSkin ? dataSkin.displayId : undefined;
  },
  formatDisplayText: (text) => cap(text.replaceAll('-', ' ')),
  getDisplayTitle: function ({ type, id }) {
    switch (this.Data[type][id].behavior) {
      case 'user-hostile':
        return this.formatDisplayText('creature');
      case 'quest-passive':
        return this.formatDisplayText('npc');
      case 'user':
        if (this.Data[type][id].model.user.username) return this.formatDisplayText('user');
        else return this.formatDisplayText('guest user');
      case 'item-quest':
      case 'decor':
      default:
        return this.formatDisplayText(this.Data[type][id].behavior);
    }
  },
  getDisplayName: function ({ type, id }) {
    switch (this.Data[type][id].behavior) {
      case 'user':
        return this.formatDisplayText(
          this.Data[type][id].model.user.username
            ? this.Data[type][id].model.user.username
            : id === 'main'
            ? SocketIo.socket.id.slice(0, 7)
            : id.slice(0, 7),
        );
      case 'user-hostile':
      case 'quest-passive':
      case 'item-quest':
      case 'decor':
      default:
        return this.formatDisplayText(this.getCurrentSkinDisplayId({ type, id }));
    }
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
    WorldCyberiaManagement.Data = {};
  },
};

export { ElementsCyberia };
