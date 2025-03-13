import { Account } from '../core/Account.js';
import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { getProxyPath, htmls, s, setPath } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { Slot } from './BagCyberia.js';
import { DisplayComponent, Stat } from './CommonCyberia.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { LogInCyberia } from './LogInCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { SkillCyberia } from './SkillCyberia.js';
import { QuestManagementCyberia } from './QuestCyberia.js';
import { MatrixCyberia } from './MatrixCyberia.js';
import { InteractionPanelCyberia } from './InteractionPanelCyberia.js';

const logger = loggerFactory(import.meta);

const SocketIoCyberia = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(ElementsCyberia.Data))
        SocketIo.Event[type][s4()] = async (args) => {
          args = JSON.parse(args[0]);

          switch (type) {
            case 'user':
              if (args.id === SocketIo.socket.id) args.id = 'main';

              break;

            case 'chat':
              {
                const idModal = 'modal-chat';
                if (s(`.${idModal}-chat-box`)) Chat.appendChatBox({ idModal, ...args });
              }
              break;

            default:
              break;
          }

          // logger.info('ws on event', args);
          const { id, element, status } = args;

          switch (status) {
            case 'update-life':
              if (!ElementsCyberia.Data[type][id]) return;
              ElementsCyberia.Data[type][id].life = element.life;
              PixiCyberia.updateLife({ type, id });
              if (ElementsCyberia.Data[type][id].life <= 0 && type === 'user' && id === 'main')
                SkillCyberia.renderDeadCooldown({ type, id });
              break;
            case 'update-position':
              if (!ElementsCyberia.Data[type][id]) return;
              ElementsCyberia.Data[type][id].x = element.x;
              ElementsCyberia.Data[type][id].y = element.y;
              PixiCyberia.updatePosition({ type, id });
              break;
            case 'update-model-user':
              ElementsCyberia.Data[type][id].model.user = {
                ...ElementsCyberia.Data[type][id].model.user,
                ...element.model.user,
              };
              if (element.model.user.username) PixiCyberia.setUsername({ type, id });
              break;
            case 'update-skin-position':
              if (!ElementsCyberia.Data[type][id]) return;
              ElementsCyberia.Data[type][id].components.skin = element.components.skin;
              if (args.updateStat) {
                ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
                PixiCyberia.setDisplayComponent({ type, id });
              } else PixiCyberia.triggerUpdateDisplay({ type, id });

              break;
            case 'update-item':
              {
                if (!ElementsCyberia.Data[type][id]) return;
                const { itemType } = args;
                ElementsCyberia.Data[type][id].components[itemType] = element.components[itemType];
                ElementsCyberia.Data[type][id] = Stat.set(type, ElementsCyberia.Data[type][id]);
                PixiCyberia.setDisplayComponent({ type, id });
              }
              break;
            case 'disconnect':
              {
                const idPanel = `action-panel-${type}-${id}`;
                if (s(`.${idPanel}`)) InteractionPanelCyberia.PanelRender.removeActionPanel(idPanel);
              }
              this.disconnect({ type, id });
              break;
            case 'connection':
              ElementsCyberia.Init({ type, id, element });
              PixiCyberia.setComponents({ type, id });
              if (type === 'user' && id === 'main' && !ElementsCyberia.Data[type][id].model.user._id)
                await LogInCyberia();
              if (type === 'user' || type === 'bot') {
                PixiCyberia.setUsername({ type, id });
              }
              if (type === 'user' && id === 'main') {
                if (ElementsCyberia.Data[type][id].life <= 0) SkillCyberia.renderDeadCooldown({ type, id });
                LoadingAnimation.barLevel.append();
                resolve();
              }
              break;
            case 'email-confirmed':
              const newUser = { ...ElementsCyberia.Data.user.main.model.user, emailConfirmed: true };
              Account.renderVerifyEmailStatus(newUser);
              Account.triggerUpdateEvent({ user: newUser });
              break;
            case 'update-coin':
              if (type === 'user' && id === 'main') {
                ElementsCyberia.Data[type][id].coin = element.coin;
                Slot.coin.update({ bagId: 'cyberia-bag', type, id });
              }
              break;
            case 'update-weapon':
              if (type === 'user' && id === 'main') {
                const displayId = element.id;
                const itemType = 'weapon';

                ElementsCyberia.Data[type][id][itemType].tree.push({ id: displayId });
                if (!ElementsCyberia.Data[type][id].components[itemType].find((c) => c.displayId === displayId)) {
                  ElementsCyberia.Data[type][id].components[itemType].push(DisplayComponent.get[displayId]());
                }
                Slot[itemType].update({ bagId: 'cyberia-bag', displayId, type, id });
              }
              break;
            case 'update-resource':
              if (type === 'user' && id === 'main') {
                ElementsCyberia.Data[type][id].resource.tree = element.resource.tree;
                ElementsCyberia.Data[type][id].components.resource = element.components.resource;
                Slot.resource.update({ bagId: 'cyberia-bag', displayId: element.resource.id, type, id });
              }
              break;
            case 'update-quantity-quest-item':
              if (type === 'user' && id === 'main') {
                const { questData, displayId, questIndex, itemQuestIndex } = args;
                const currentQuestData = ElementsCyberia.Data.user.main.model.quests.find((q) => q.id === questData.id);
                if (currentQuestData) {
                  const interactionPanelQuestId = questData ? `interaction-panel-${questData.id}` : undefined;
                  QuestManagementCyberia.updateQuestItemProgressDisplay({
                    interactionPanelQuestId,
                    displayId,
                    questData,
                    currentQuestDataIndex: questIndex,
                    currentStep: currentQuestData.currentStep,
                    searchObjectIndex: itemQuestIndex,
                  });
                }
              }
              break;
            default:
              break;
          }
        };
      SocketIo.Event.connect[s4()] = async (reason) => {};
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        LoadingAnimation.barLevel.clear();
        htmls(
          `.ssr-loading-info`,
          html`<span style="color: white">connecting </span> ...${location.hostname.slice(-30)}`,
        );
        s('.ssr-background-cyberia-lore').style.display = 'block';
        setTimeout((s('.ssr-background-cyberia-lore').style.opacity = '1'));
        s(`.main-user-container`).style.display = 'none';
        PixiCyberia.removeAll();
        ElementsCyberia.removeAll();
        Webhook.unregister();
        WebhookCyberia.unregister();
      };
    });
  },
  changeServer: async function (options = { name: '' }) {
    if (options && options.name) setPath('/' + options.name);
    await MatrixCyberia.loadData();
    LoadingAnimation.barLevel.clear();
    await SocketIo.Init({ channels: ElementsCyberia.Data });
    return await this.Init();
  },
  disconnect: async function ({ type, id }) {
    PixiCyberia.removeElement({ type, id });
    ElementsCyberia.remove({ type, id });
  },
};

export { SocketIoCyberia };
