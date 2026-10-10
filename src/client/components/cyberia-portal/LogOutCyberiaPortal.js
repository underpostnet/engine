import { LogOut } from '../core/LogOut.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';

class LogOutCyberiaPortal {
  static async instance() {
    LogOut.onLogout(
      async (result = { user: { _id: '' } }) => {
        AppStoreCyberiaPortal.Data.user.main.model.user = result.user;
      },
      { key: 'LogOutCyberiaPortal' },
    );
  }
}

export { LogOutCyberiaPortal };
