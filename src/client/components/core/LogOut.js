import { Auth } from './Auth.js';
import { BtnIcon } from './BtnIcon.js';
import { LogIn } from './LogIn.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';
import { WebhookProvider } from './Webhook.js';
import { NotificationManager } from './NotificationManager.js';
class LogOut {
  static Event = {};
  static async Trigger(options) {
    await WebhookProvider.unregister();
    for (const eventKey of Object.keys(LogOut.Event)) await LogOut.Event[eventKey](options);
    if (s(`.session`))
      htmls(
        `.session`,
        html`<style>
          .session-in-log-out {
            display: block;
          }
          .session-inl-log-out {
            display: inline-table;
          }
          .session-fl-log-out {
            display: flow-root;
          }
          .session-in-log-in {
            display: none;
          }
          .session-inl-log-in {
            display: none;
          }
          .session-fl-log-in {
            display: none;
          }
        </style>`,
      );
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
