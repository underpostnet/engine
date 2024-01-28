const Auth = {
  token: '',
  setToken: function (token) {
    return (this.token = token);
  },
  getToken: function () {
    return this.token;
  },
  getJWT: function () {
    return this.token ? `Bearer ${this.getToken()}` : undefined;
  },
  deleteToken: function () {
    return (this.token = '');
  },
};

export { Auth };
