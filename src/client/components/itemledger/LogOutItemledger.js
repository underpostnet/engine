import { LogOut } from '../core/LogOut.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

class LogOutItemledger {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreItemledger.Data.user.main.model.user = result.user;
  }, { key: 'LogOutItemledger' });
  }
}

export { LogOutItemledger };
