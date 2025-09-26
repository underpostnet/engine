import { LogOut } from '../core/LogOut.js';
import { s } from '../core/VanillaJs.js';
import { WebhookCyberia } from './WebhookCyberia.js';
import { ElementsCyberia } from './ElementsCyberia.js';
import { ServerCyberiaPortal } from '../cyberia-portal/ServerCyberiaPortal.js';

const LogOutCyberia = function () {
  LogOut.Event['LogOutCyberia'] = async (result = { user: { _id: '' } }) => {
    ElementsCyberia.Data.user.main.model.user = result.user;
    const type = 'user';
    const id = 'main';

    s(`.main-btn-server`).classList.add('hide');
    s(`.main-btn-admin`).classList.add('hide');

    WebhookCyberia.unregister();
    // const oldElement = newInstance(ElementsCyberia.Data[type][id]);
    // ElementsCyberia.Data[type][id] = BaseElement()[type][id];
    // await MainUserCyberia.Update({ oldElement });
    await ServerCyberiaPortal.internalChangeServer();
  };
};

export { LogOutCyberia };
