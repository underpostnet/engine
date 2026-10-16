import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { AuthEventType, authLogoutEvents } from './ClientEvents.js';
import { LogIn } from './LogIn.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';
import { WebhookProvider } from './Webhook.js';
import { NotificationManager } from './NotificationManager.js';
class LogOut {
  static Event = {};
  static onLogout(listener, options = {}) {
    return authLogoutEvents.on(AuthEventType.logout, listener, options);
  }
  static offLogout(key) {
    return authLogoutEvents.off(key);
  }
  static hasLogoutListener(key) {
    return authLogoutEvents.has(key);
  }
  static async Trigger(options) {
    await WebhookProvider.unregister();
    await authLogoutEvents.emit(AuthEventType.logout, options);
    for (const eventKey of Object.keys(LogOut.Event)) await LogOut.Event[eventKey](options);
    document.documentElement.dataset.session = 'log-out';
  }
  static async instance() {
    setTimeout(() => {
      s('.btn-log-out').onclick = async (e) => {
        e.preventDefault();
        await Auth.sessionOut();
        NotificationManager.Push({
          html: Translate.instance(`success-logout`),
          status: 'success',
        });
      };
    });
    // Translate.instance('confirm-logout')
    return html` <form class="in">
      <div class="in">
        ${await BtnIcon.instance({
          class: 'inl section-mp btn-custom btn-log-out',
          label: html`<i class="fa-solid fa-power-off"></i> ${Translate.instance('log-out')}`,
          type: 'submit',
        })}
      </div>
    </form>`;
  }
}
export { LogOut };
