import { LogOut } from '../core/LogOut.js';
import { ElementsDefault } from './ElementsDefault.js';

const LogOutDefault = async function () {
  LogOut.Event['LogOutDefault'] = async (result = { user: { _id: '' } }) => {
    ElementsDefault.Data.user.main.model.user = result.user;
  };
};

export { LogOutDefault };
