import { LogOut } from '../core/LogOut.js';
import { s } from '../core/VanillaJs.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';

class LogOutHealthcare {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreHealthcare.Data.user.main.model.user = result.user;

    if (s(`.real-state-panel-form-body`) && !s(`.real-state-panel-form-body`).classList.contains('hide'))
      s(`.btn-real-state-panel-close`).click();

    s(`.main-btn-healthcare-appointment-management`).classList.add('hide');
  }, { key: 'LogOutHealthcare' });
  }
}

export { LogOutHealthcare };
