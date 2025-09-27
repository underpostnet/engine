import { UserMock, UserService } from '../../services/user/user.service.js';
import { Account } from './Account.js';
import { loggerFactory } from './Logger.js';
import { LogIn } from './LogIn.js';
import { LogOut } from './LogOut.js';
import { NotificationManager } from './NotificationManager.js';
import { SignUp } from './SignUp.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta, { trace: true });

const token = Symbol('token');

const guestToken = Symbol('guestToken');

const refreshTimeout = Symbol('refreshTimeout');

const Auth = {
  [token]: '',
  [guestToken]: '',
  setToken: function (value = '') {
    return (this[token] = value);
  },
  deleteToken: function () {
    return (this[token] = '');
  },
  getToken: function () {
    return this[token];
  },
  setGuestToken: function (value = '') {
    return (this[guestToken] = value);
  },
  deleteGuestToken: function () {
    return (this[guestToken] = '');
  },
  getGuestToken: function () {
    return this[guestToken];
  },
  getJWT: function () {
    if (Auth.getToken()) return `Bearer ${Auth.getToken()}`;
    if (Auth.getGuestToken()) return `Bearer ${Auth.getGuestToken()}`;
    return '';
  },
  decodeJwt: function (token) {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      return null;
    }
  },
  scheduleTokenRefresh: function () {
    if (this[refreshTimeout]) {
      clearTimeout(this[refreshTimeout]);
    }

    const currentToken = Auth.getToken();
    if (!currentToken) return;

    const payload = Auth.decodeJwt(currentToken);
    if (!payload || !payload.refreshExpiresAt) return;

    const expiresIn = payload.refreshExpiresAt - Date.now();
    const refreshBuffer = 2 * 60 * 1000; // 2 minutes
    const refreshIn = expiresIn - refreshBuffer;

    logger.info(`Token refresh in ${refreshIn / (1000 * 60)} minutes`);

    if (refreshIn <= 0) return; // Already expired or close to it

    this[refreshTimeout] = setTimeout(async () => {
      const { data, status } = await UserService.get({ id: 'auth' });
      if (status === 'success') {
        logger.info('Refreshed access token.');
        Auth.setToken(data.token);
        localStorage.setItem('jwt', data.token);
        Auth.scheduleTokenRefresh();
      } else Auth.sessionOut();
    }, refreshIn);
  },
  signUpToken: async function (
    result = {
      data: {
        token: '',
        user: null,
      },
    },
  ) {
    try {
      localStorage.setItem('jwt', result.data.token);
      await SignUp.Trigger(result.data);
      Auth.setToken(result.data.token);
      await Auth.sessionIn();
    } catch (error) {
      logger.error(error);
      localStorage.removeItem('jwt');
    }
  },
  sessionIn: async function (userServicePayload) {
    try {
      const token = userServicePayload?.data?.token ? userServicePayload.data.token : localStorage.getItem('jwt');
      if (token) {
        Auth.setToken(token);

        const result = userServicePayload
          ? userServicePayload // From login/signup
          : await UserService.get({ id: 'auth' });

        const { status, data, message } = result;
        if (status === 'success') {
          Auth.setToken(data.token);
          localStorage.setItem('jwt', token);
          NotificationManager.Push({
            html: status === 'success' ? Translate.Render(`${status}-user-log-in`) : message,
            status: status,
          });
          Auth.renderSessionUI();
          await LogIn.Trigger({ user: data.user });
          await Account.updateForm(data.user);
          Auth.scheduleTokenRefresh();
          return { user: data.user };
        }
        if (message && message.match('expired'))
          setTimeout(() => {
            s(`.main-btn-log-in`).click();
            NotificationManager.Push({
              html: Translate.Render(`expired-session`),
              status: 'warning',
            });
          });
      }
      Auth.deleteToken();
      localStorage.removeItem('jwt');

      // Anon guest session
      let guestToken = localStorage.getItem('jwt.g');
      if (guestToken) {
        Auth.setGuestToken(guestToken);
        let { data, status, message } = await UserService.get({ id: 'auth' });
        if (status === 'success') {
          await LogIn.Trigger(data);
          await Account.updateForm(data.user);
          return data;
        } else logger.error(message);
      }
      return await Auth.sessionOut();
    } catch (error) {
      logger.error(error);
      return { user: UserMock.default };
    }
  },
  sessionOut: async function () {
    {
      const result = await UserService.delete({ id: 'logout' });
      localStorage.removeItem('jwt');
      Auth.deleteToken();
      if (this[refreshTimeout]) {
        clearTimeout(this[refreshTimeout]);
      }
      Auth.renderGuestUi();
      LogIn.Scope.user.main.model.user = {};
      await LogOut.Trigger(result);
      NotificationManager.Push({
        html: Translate.Render(`success-logout`),
        status: 'success',
      });
    }
    {
      localStorage.removeItem('jwt.g');
      Auth.deleteGuestToken();
      const result = await UserService.post({ id: 'guest' });
      localStorage.setItem('jwt.g', result.data.token);
      Auth.setGuestToken(result.data.token);
      return await Auth.sessionIn();
    }
  },
  renderSessionUI: function () {
    s(`.main-btn-log-in`).style.display = 'none';
    s(`.main-btn-sign-up`).style.display = 'none';
    s(`.main-btn-log-out`).style.display = null;
    s(`.main-btn-account`).style.display = null;
    setTimeout(() => {
      if (s(`.modal-log-in`)) s(`.btn-close-modal-log-in`).click();
      if (s(`.modal-sign-up`)) s(`.btn-close-modal-sign-up`).click();
    });
  },
  renderGuestUi: function () {
    s(`.main-btn-log-in`).style.display = null;
    s(`.main-btn-sign-up`).style.display = null;
    s(`.main-btn-log-out`).style.display = 'none';
    s(`.main-btn-account`).style.display = 'none';
    setTimeout(() => {
      if (s(`.modal-log-out`)) s(`.btn-close-modal-log-out`).click();
      if (s(`.modal-account`)) s(`.btn-close-modal-account`).click();
    });
  },
};

export { Auth };
