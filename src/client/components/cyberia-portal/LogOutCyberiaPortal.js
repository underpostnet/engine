import { LogOut } from '../core/LogOut.js';
import { s } from '../core/VanillaJs.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';

class LogOutCyberiaPortal {
  static async instance() {
  LogOut.onLogout(async (result = { user: { _id: '' } }) => {
    AppStoreCyberiaPortal.Data.user.main.model.user = result.user;
    s(`.main-btn-admin`).classList.add('hide');
    await ObjectLayerManagement.Reload('viewer');
  }, { key: 'LogOutCyberiaPortal' });
  }
}

export { LogOutCyberiaPortal };
