import { LogOut } from '../core/LogOut.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

class LogOutBymyelectrics {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreBymyelectrics.Data.user.main.model.user = result.user;
  }, { key: 'LogOutBymyelectrics' });
  }
}

export { LogOutBymyelectrics };
