const token = Symbol('token');

const Auth = {
  [token]: null,
  setToken: function (value = '') {
    return (this[token] = value);
  },
  getToken: function () {
    return this[token];
  },
  getJWT: function () {
    return `Bearer ${this.getToken()}`;
  },
  deleteToken: function () {
    return (this[token] = null);
  },
};

export { Auth };
