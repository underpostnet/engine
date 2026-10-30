import { GoogleAuthService } from '../../services/google-auth/google-auth.service.js';
import { Auth } from '../core/Auth.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { getId } from '../core/CommonJs.js';
import { EventsUI } from '../core/EventsUI.js';
import { LogIn } from '../core/LogIn.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { RouterReady, getProxyPath, getQueryParams, setQueryParams } from '../core/Router.js';
import { Translate } from '../core/Translate.js';
import { s } from '../core/VanillaJs.js';

/** Outcomes with a message of their own. Any other value reads as `error`. */
const OUTCOMES = ['link', 'cancelled', 'conflict', 'unverified-email', 'error'];

/** Shows a message once the shell has rendered the notification board. */
const notify = (key, status) =>
  RouterReady.then(() =>
    NotificationManager.Push({ html: Translate.instance(key, undefined, { disableTextFormat: true }), status }),
  );

/**
 * Google sign-in for the log-in and sign-up views. The server runs the OAuth flow and resolves
 * the account; this component starts the flow and turns its return into a session through
 * `Auth.sessionIn`, or into a link after the player logs in to the account.
 */
class GoogleSignIn {
  static Tokens = {};
  static style = css`
    .google-sign-in-btn .BtnIcon-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .google-sign-in-icon {
      flex: none;
      width: 30px;
      height: 30px;
      image-rendering: pixelated;
    }
    .google-sign-in-btn:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    .google-sign-in-btn[aria-busy='true'] {
      cursor: progress;
      opacity: 0.6;
    }
    .google-sign-in-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: 0.7;
    }
    .google-sign-in-divider::before,
    .google-sign-in-divider::after {
      content: '';
      flex: 1;
      border-top: 1px solid currentColor;
    }
  `;

  /**
   * The Google button, then a divider before the email form.
   * @param {{view?: string}} [options] - The view the button is in: `log-in` or `sign-up`.
   */
  static async instance({ view = 'log-in' } = {}) {
    const id = getId(GoogleSignIn.Tokens, 'google-sign-in-');
    GoogleSignIn.Tokens[id] = {};
    setTimeout(() =>
      EventsUI.onClick(`.${id}`, async () => {
        const button = s(`.${id}`);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        // A page restored from the back-forward cache gets its button back.
        window.addEventListener(
          'pageshow',
          () => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
          },
          { once: true },
        );
        location.assign(GoogleAuthService.signInUrl(view));
      }),
    );
    return html`<style>
        ${GoogleSignIn.style}
      </style>
      <div class="inl">
        ${await BtnIcon.instance({
          class: `in section-mp form-button google-sign-in-btn ${id}`,
          label: html`<img class="google-sign-in-icon" src="${getProxyPath()}assets/ui-icons/google.png" alt="" />
            ${Translate.instance('continue-with-google', undefined, { disableTextFormat: true })}`,
        })}
        <div class="section-mp google-sign-in-divider">${Translate.instance('or')}</div>
      </div>`;
  }

  /**
   * Finishes a Google flow the server returned to this page; the server already opened the view
   * it returned to. The outcome leaves the URL at once. A success becomes a session, a `link`
   * waits for a log-in, and every outcome shows its message. Messages wait for the shell to
   * render; the session does not.
   * @returns {Promise<{user: object}|null>} The session, or null when there is none to resume.
   */
  static async resume() {
    const { 'google-auth': status, 'google-auth-flow': flow } = getQueryParams();
    if (!status) return null;
    setQueryParams({ 'google-auth': null, 'google-auth-flow': null });
    if (status === 'success') {
      const result = await GoogleAuthService.session(flow);
      if (result.status === 'success') {
        const session = await Auth.sessionIn(result);
        notify('success-user-log-in', 'success');
        return session;
      }
      notify('google-auth-error', 'error');
      RouterReady.then(() => s(`.main-btn-log-in`)?.click());
      return null;
    }
    if (status === 'link') GoogleSignIn.linkOnLogIn(flow);
    const outcome = OUTCOMES.includes(status) ? status : 'error';
    notify(`google-auth-${outcome}`, outcome === 'link' || outcome === 'cancelled' ? 'info' : 'error');
    return null;
  }

  /**
   * Links the Google account of a flow when a log-in proves the account it belongs to.
   * @param {string} flow - The flow that verified the Google account.
   */
  static linkOnLogIn(flow) {
    const stop = LogIn.onLogin(
      async ({ user }) => {
        if (!user || user.role === 'guest') return;
        stop();
        const { status, code } = await GoogleAuthService.link(flow);
        if (status === 'success') return notify('google-auth-linked', 'success');
        notify(code === 409 ? 'google-auth-conflict' : 'google-auth-link-expired', 'error');
      },
      { key: 'google-auth-link' },
    );
  }
}

export { GoogleSignIn };
