import { UserMock, UserService } from '../../services/user/user.service.js';
import { Account } from './Account.js';
import { loggerFactory } from './Logger.js';
import { LogIn } from './LogIn.js';
import { LogOut } from './LogOut.js';
import { NotificationManager } from './NotificationManager.js';
import { SignUp } from './SignUp.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const token = Symbol('token');

const guestToken = Symbol('guestToken');

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
  // jwt
  getJWT: function () {
    return `Bearer ${this.getToken() ? this.getToken() : this.getGuestToken()}`;
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
        this.setToken(token);
        const result = userServicePayload
          ? userServicePayload
          : await (async () => {
              const _result = await UserService.get({ id: 'auth' });
              return {
                status: _result.status,
                message: _result.message,
                data: {
                  user: _result.data,
                },
              };
            })();
        const { status, data, message } = result;
        if (status === 'success') {
          localStorage.setItem('jwt', token);
          await LogIn.Trigger({ user: data.user });
          await Account.updateForm(data.user);
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
        return await Auth.sessionOut();
      }

      // anon guest session
      this.deleteToken();
      localStorage.removeItem('jwt');
      let guestToken = localStorage.getItem('jwt.g');

      if (!guestToken) {
        const result = await UserService.post({ id: 'guest' });
        localStorage.setItem('jwt.g', result.data.token);
        guestToken = result.data.token;
      }

      this.setGuestToken(guestToken);
      let { data, status, message } = await UserService.get({ id: 'auth' });
      if (status === 'error') {
        if (message && message.match('expired')) {
          localStorage.removeItem('jwt.g');
          return await Auth.sessionOut();
        } else throw new Error(message);
      }
      await Account.updateForm(data);
      return { user: data };
    } catch (error) {
      logger.error(error);
      return { user: UserMock.default };
    }
  },
  sessionOut: async function () {
    this.deleteToken();
    localStorage.removeItem('jwt');
    const result = await this.sessionIn();
    await LogOut.Trigger(result);
    return result;
  },
};

export { Auth };
