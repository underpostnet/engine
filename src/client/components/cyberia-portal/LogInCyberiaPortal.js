import { Auth } from '../core/Auth.js';
import { LogIn } from '../core/LogIn.js';
import { s } from '../core/VanillaJs.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';

class LogInCyberiaPortal {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { token, user } = options;

    AppStoreCyberiaPortal.Data.user.main.model.user = user;

    await ObjectLayerManagement.Reload('viewer');
  }, { key: 'LogInCyberiaPortal' });
  const { user } = await Auth.sessionIn();
  AppStoreCyberiaPortal.Data.user.main.model.user = user;
  }
}

export { LogInCyberiaPortal };
