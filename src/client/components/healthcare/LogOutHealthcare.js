import { LogOut } from '../core/LogOut.js';
import { s } from '../core/VanillaJs.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';

const LogOutHealthcare = async function () {
  LogOut.Event['LogOutHealthcare'] = async (result = { user: { _id: '' } }) => {
    AppStoreHealthcare.Data.user.main.model.user = result.user;

    if (s(`.real-state-panel-form-body`) && !s(`.real-state-panel-form-body`).classList.contains('hide'))
      s(`.btn-real-state-panel-close`).click();

    s(`.main-btn-healthcare-appointment-management`).classList.add('hide');
  };
};

export { LogOutHealthcare };
