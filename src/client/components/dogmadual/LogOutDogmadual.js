import { LogOut } from '../core/LogOut.js';
import { AppStoreDogmadual } from './AppStoreDogmadual.js';

class LogOutDogmadual {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreDogmadual.Data.user.main.model.user = result.user;
  }, { key: 'LogOutDogmadual' });
  }
}

export { LogOutDogmadual };
