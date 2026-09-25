import { LogOut } from '../core/LogOut.js';
import { AppStoreObjectlayer } from './AppStoreObjectlayer.js';

class LogOutObjectlayer {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreObjectlayer.Data.user.main.model.user = result.user;
  }, { key: 'LogOutObjectlayer' });
  }
}

export { LogOutObjectlayer };
