const token = Symbol('token');

const Auth = {
  [token]: '',
  setToken: function (value = '') {
    return (this[token] = value);
  },
  deleteToken: function () {
    return (this[token] = '');
  },
  getToken: function () {
    return this[token];
  },
  getJWT: function () {
    return `Bearer ${this.getToken()}`;
  },
};

export { Auth };
