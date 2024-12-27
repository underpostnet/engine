import { UserService } from '../../services/user/user.service.js';
import { LogIn } from './LogIn.js';
import { LogOut } from './LogOut.js';
import { SignUp } from './SignUp.js';

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
      },
    },
  ) {
    localStorage.setItem('jwt', result.data.token);
    await SignUp.Trigger(result.data);
    await LogIn.Trigger(result.data);
  },
  sessionIn: async function (userServicePayload) {
    const token = userServicePayload?.data?.token ? userServicePayload.data.token : localStorage.getItem('jwt');

    if (token) {
      this.setToken(token);
      const result = userServicePayload
        ? userServicePayload
        : await (async () => {
            const _result = await UserService.get({ id: 'auth' });
            return {
              status: _result.status,
              data: {
                user: _result.data,
              },
            };
          })();
      const { status, data } = result;
      if (status === 'success') {
        localStorage.setItem('jwt', token);
        await LogIn.Trigger({ user: data.user });
        return { user: data.user };
      }
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
    const { data } = await UserService.get({ id: 'auth' });
    return { user: data };
  },
  sessionOut: async function () {
    this.deleteToken();
    localStorage.removeItem('jwt');
    await LogOut.Trigger(await this.sessionIn());
  },
};

export { Auth };
