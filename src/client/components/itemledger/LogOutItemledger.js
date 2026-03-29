import { LogOut } from '../core/LogOut.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

const LogOutItemledger = async function () {
  LogOut.Event['LogOutItemledger'] = async (result = { user: { _id: '' } }) => {
    AppStoreItemledger.Data.user.main.model.user = result.user;
  };
};

export { LogOutItemledger };
