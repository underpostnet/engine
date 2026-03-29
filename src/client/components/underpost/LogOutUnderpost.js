import { LogOut } from '../core/LogOut.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';
import { PanelForm } from '../core/PanelForm.js';
import { s } from '../core/VanillaJs.js';

const LogOutUnderpost = async function () {
  LogOut.Event['LogOutUnderpost'] = async (result = { user: { _id: '' } }) => {
    AppStoreUnderpost.Data.user.main.model.user = result.user;

    PanelForm.Data['underpost-panel'].updatePanel();
    if (s(`.main-btn-cloud`)) s(`.main-btn-cloud`).classList.add('hide');
  };
};

export { LogOutUnderpost };
