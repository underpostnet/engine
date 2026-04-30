import { LogOut } from '../core/LogOut.js';
import { AppStoreCecinasmarcelina } from './AppStoreCecinasmarcelina.js';

class LogOutCecinasmarcelina {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreCecinasmarcelina.Data.user.main.model.user = result.user;
  }, { key: 'LogOutCecinasmarcelina' });
  }
}

export { LogOutCecinasmarcelina };
