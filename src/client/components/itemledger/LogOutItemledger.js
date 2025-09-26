import { LogOut } from '../core/LogOut.js';
import { ElementsItemledger } from './ElementsItemledger.js';

const LogOutItemledger = async function () {
  LogOut.Event['LogOutItemledger'] = async (result = { user: { _id: '' } }) => {
    ElementsItemledger.Data.user.main.model.user = result.user;
  };
};

export { LogOutItemledger };
