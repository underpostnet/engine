import { Auth } from '../core/Auth.js';
import { GoogleSignIn } from '../core/GoogleSignIn.js';
import { LogIn } from '../core/LogIn.js';
import { StudioCyberia } from '../cyberia/StudioCyberia.js';
import { resumeLaunch } from '../cyberia/GameLaunchCyberia.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';

class LogInCyberiaPortal {
  static async instance() {
  LogIn.onLogin(async (options) => {
    const { user } = options;
    const changed = AppStoreCyberiaPortal.Data.user.main.model.user?._id !== user?._id;
    AppStoreCyberiaPortal.Data.user.main.model.user = user;
    if (changed) await StudioCyberia.reload();
  }, { key: 'LogInCyberiaPortal' });
  LogIn.onLogin(() => resumeLaunch(), { key: 'CyberiaPortalPlay' });
  const { user } = (await GoogleSignIn.resume()) ?? (await Auth.sessionIn());
  AppStoreCyberiaPortal.Data.user.main.model.user = user;
  await resumeLaunch();
  }
}

export { LogInCyberiaPortal };
