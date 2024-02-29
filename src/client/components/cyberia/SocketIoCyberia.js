import { Account } from '../core/Account.js';
import { Chat } from '../core/Chat.js';
import { s4 } from '../core/CommonJs.js';
import { LoadingAnimation } from '../core/LoadingAnimation.js';
import { loggerFactory } from '../core/Logger.js';
import { SocketIo } from '../core/SocketIo.js';
import { s } from '../core/VanillaJs.js';
import { Webhook } from '../core/Webhook.js';
import { Elements } from './Elements.js';
import { MainUser } from './MainUser.js';
import { Pixi } from './Pixi.js';

const logger = loggerFactory(import.meta);

const SocketIoCyberia = {
  Init: function () {
    return new Promise((resolve) => {
      for (const type of Object.keys(Elements.Data))
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
              if (!Elements.Data[type][id]) return;
              Elements.Data[type][id].life = element.life;
              Pixi.updateLife({ type, id });
              break;
            case 'update-position':
              if (!Elements.Data[type][id]) return;
              Elements.Data[type][id].x = element.x;
              Elements.Data[type][id].y = element.y;
              Pixi.updatePosition({ type, id });
              break;

            case 'update-skin-position':
              if (!Elements.Data[type][id]) return;
              Elements.Data[type][id].components.skin = element.components.skin;
              Pixi.triggerUpdateSkinPosition({ type, id });
              break;
            case 'disconnect':
              Pixi.removeElement({ type, id });
              delete Elements.Data[type][id];
              break;
            case 'connection':
              Elements.Init({ type, id, element });
              Pixi.setComponents({ type, id });
              if (type === 'user' && id === 'main') {
                await MainUser.Update();
                setTimeout(() => {
                  s('.ssr-background').style.opacity = 0;
                  setTimeout(async () => {
                    s('.ssr-background').style.display = 'none';
                    s(`.main-user-container`).style.display = 'block';
                    LoadingAnimation.bar.stop('init-loading');
                    if (Elements.Data.user.main.model.user._id)
                      Webhook.register({
                        user: {
                          _id: Elements.Data.user.main.model.user._id,
                        },
                      });
                    resolve();
                  }, 300);
                });
              }
              break;
            case 'email-confirmed':
              const newUser = { ...Elements.Data.user.main.model.user, emailConfirmed: true };
              Account.renderVerifyEmailStatus(newUser);
              Account.triggerUpdateEvent({ user: newUser });
              break;
            default:
              break;
          }
        };
      SocketIo.Event.connect[s4()] = async (reason) => {
        if (Elements.Data.user.main.model.user._id)
          Webhook.register({
            user: {
              _id: Elements.Data.user.main.model.user._id,
            },
          });
      };
      SocketIo.Event.disconnect[s4()] = async (reason) => {
        s('.ssr-background').style.display = 'block';
        setTimeout((s('.ssr-background').style.opacity = '1'));
        s(`.main-user-container`).style.display = 'none';
        LoadingAnimation.bar.play('init-loading');
        Pixi.removeAll();
        Elements.removeAll();
        Webhook.unregister();
      };
    });
  },
};

export { SocketIoCyberia };
