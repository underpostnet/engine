import { LogOut } from '../core/LogOut.js';
import { ElementsCryptokoyn } from './ElementsCryptokoyn.js';

const LogOutCryptokoyn = async function () {
  LogOut.Event['LogOutCryptokoyn'] = async (result = { user: { _id: '' } }) => {
    ElementsCryptokoyn.Data.user.main.model.user = result.user;
  };
};

export { LogOutCryptokoyn };
