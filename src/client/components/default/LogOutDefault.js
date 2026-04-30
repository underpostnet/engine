import { LogOut } from '../core/LogOut.js';
import { AppStoreDefault } from './AppStoreDefault.js';

class LogOutDefault {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreDefault.Data.user.main.model.user = result.user;
  }, { key: 'LogOutDefault' });
  }
}

export { LogOutDefault };
