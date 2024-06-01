import { Account } from '../core/Account.js';
import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { htmls, s } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { Slot } from './BagCyberia.js';
import { Stat } from './CommonCyberia.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { LogInCyberia } from './LogInCyberia.js';
import { PixiCyberia } from './PixiCyberia.js';
import { SkillCyberia } from './SkillCyberia.js';

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
              if (s(`.chat-box`)) Chat.appendChatBox(args);
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
              PixiCyberia.removeElement({ type, id });
              delete ElementsCyberia.Data[type][id];
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
            default:
              break;
          }
        };
      SocketIo.Event.connect[s4()] = async (reason) => {};
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        LoadingAnimation.barLevel.clear();
        s('.ssr-background').style.display = 'block';
        setTimeout((s('.ssr-background').style.opacity = '1'));
        s(`.main-user-container`).style.display = 'none';
        PixiCyberia.removeAll();
        ElementsCyberia.removeAll();
        Webhook.unregister();
        WebhookCyberia.unregister();
      };
    });
  },
};

export { SocketIoCyberia };
