import { LogOut } from '../core/LogOut.js';
import { AppStoreCryptokoyn } from './AppStoreCryptokoyn.js';

class LogOutCryptokoyn {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreCryptokoyn.Data.user.main.model.user = result.user;
  }, { key: 'LogOutCryptokoyn' });
  }
}

export { LogOutCryptokoyn };
