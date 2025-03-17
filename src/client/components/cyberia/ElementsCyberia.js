import { CyberiaBotService } from '../../services/cyberia-bot/cyberia-bot.service.js';
import { cap, random } from '../core/CommonJs.js';
import { borderChar } from '../core/Css.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { BaseElement, QuestComponent } from './CommonCyberia.js';
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
  findIdFromDisplayId: function (type, displayId) {
    return Object.keys(this.Data[type]).find((botId) =>
      this.Data[type][botId].components.skin.find((s) => s.current && s.displayId === displayId),
    );
  },
  getCurrentSkinDisplayId: function ({ type, id }) {
    const dataSkin = this.Data[type][id].components.skin.find((s) => s.current);
    return dataSkin ? dataSkin.displayId : undefined;
  },
  getElement: async function (type, id, displayId) {
    if (id in ElementsCyberia.Data[type]) return ElementsCyberia.Data[type][id];
    const { apiPaths } = displayId in QuestComponent.componentsScope ? QuestComponent.componentsScope[displayId] : {};
    const proxyPath = apiPaths ? apiPaths[random(0, apiPaths.length - 1)] : undefined;
    const result = await CyberiaBotService.get({
      id: `display-id/${displayId}`,
      proxyPath,
    });
    id = result.data.id;
    const element = result.data;
    delete element.id;
    ElementsCyberia.Init({ type, id, element });
    return result.data;
  },
  formatDisplayText: (text) => cap(text.replaceAll('-', ' ')),
  getDisplayTitle: function ({ type, id, htmlTemplate }) {
    const htmlDisplay = (value) =>
      htmlTemplate
        ? html`<span style="color: #ffcc00; font-family: 'retro-font-sensitive'; ${borderChar(2, 'black')}"
            >${value}</span
          >`
        : value;

    if (this.Data[type][id].title) return htmlDisplay(this.formatDisplayText(this.Data[type][id].title));
    switch (this.Data[type][id].behavior) {
      case 'user-hostile':
        return htmlDisplay(this.formatDisplayText('creature'));
      case 'generic-people':
      case 'quest-passive':
        return htmlDisplay(this.formatDisplayText('villager'));
      case 'user':
        if (this.Data[type][id].model.user.role === 'admin') return htmlDisplay(this.formatDisplayText('admin'));
        if (this.Data[type][id].model.user.role === 'moderator')
          return htmlDisplay(this.formatDisplayText('moderator'));
        if (
          this.Data[type][id].model.user.username &&
          !this.Data[type][id].model.user.username.toLowerCase().match('guest')
        )
          return htmlDisplay(this.formatDisplayText('newbie'));
        else return htmlDisplay(this.formatDisplayText('anon newbie'));
      case 'item-quest':
      case 'decor':
      default:
        return this.formatDisplayText(this.Data[type][id].behavior);
    }
  },
  getDisplayName: function ({ type, id, htmlTemplate }) {
    const htmlDisplay = (value) =>
      htmlTemplate
        ? html`<span style="color: #efefef; font-family: 'retro-font-sensitive'; ${borderChar(2, 'black')}"
            >${value}</span
          >`
        : value;

    if (this.Data[type][id].name) return htmlDisplay(this.formatDisplayText(this.Data[type][id].name));
    switch (this.Data[type][id].behavior) {
      case 'user':
        return htmlDisplay(
          this.formatDisplayText(
            this.Data[type][id].model.user.username &&
              !this.Data[type][id].model.user.username.toLowerCase().match('guest')
              ? this.Data[type][id].model.user.username
              : id === 'main'
              ? SocketIo.socket.id.slice(0, 7)
              : id.slice(0, 7),
          ),
        );
      case 'generic-people':
        return '';
      case 'user-hostile':
      case 'quest-passive':
      case 'item-quest':
      case 'decor':
      default:
        return htmlDisplay(this.formatDisplayText(this.getCurrentSkinDisplayId({ type, id })));
    }
  },
  removeAll: function () {
    for (const type of Object.keys(this.Data)) {
      for (const id of Object.keys(this.Data[type])) {
        if (this.Interval[type] && this.Interval[type][id]) {
          this.removeInterval({ type, id });
        }
      }
    }
    this.Interval = {};
    this.Data = BaseElement();
    WorldCyberiaManagement.Data = {};
  },
  remove: function ({ type, id }) {
    if (this.Interval[type]) this.removeInterval({ type, id });
    if (this.Data[type]) delete this.Data[type][id];
    if (this.LocalDataScope[type]) delete this.LocalDataScope[type][id];
    if (WorldCyberiaManagement.Data[type]) delete WorldCyberiaManagement.Data[type][id];
  },
  removeInterval: function ({ type, id }) {
    if (!this.Interval[type][id]) return;
    for (const interval of Object.keys(this.Interval[type][id])) clearInterval(this.Interval[type][id][interval]);
    delete this.Interval[type][id];
  },
};

export { ElementsCyberia };
