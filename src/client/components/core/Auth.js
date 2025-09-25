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
        Auth.setToken(token);
        const result = userServicePayload
          ? userServicePayload // From login/signup
          : await (async () => {
              // From session restoration
              let _result = await UserService.get({ id: 'auth' });

              // If token is expired, try to refresh it
              if (_result.status === 'error' && _result.message?.match(/expired|invalid/i)) {
                logger.info('Access token expired, attempting to refresh...');
                try {
                  const refreshResult = await UserService.refreshToken({});
                  if (refreshResult.status === 'success' && refreshResult.data.token) {
                    Auth.setToken(refreshResult.data.token);
                    localStorage.setItem('jwt', refreshResult.data.token);
                    logger.info('Token refreshed successfully. Retrying auth request...');
                    _result = await UserService.get({ id: 'auth' }); // Retry getting user
                  } else throw new Error(refreshResult.message || 'Failed to refresh token');
                } catch (refreshError) {
                  logger.error('Failed to refresh token:', refreshError);
                  return await Auth.sessionOut();
                }
              }

              return { status: _result.status, message: _result.message, data: { user: _result.data } };
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
      Auth.deleteToken();
      localStorage.removeItem('jwt');

      // Anon guest session
      let guestToken = localStorage.getItem('jwt.g');
      if (guestToken) {
        Auth.setGuestToken(guestToken);
        let { data, status, message } = await UserService.get({ id: 'auth' });
        if (status === 'success') {
          await Account.updateForm(data);
          return { user: data };
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
      await LogOut.Trigger(result);
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
};

export { Auth };
