import { LogOut } from '../core/LogOut.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

const LogOutBymyelectrics = async function () {
  LogOut.Event['LogOutBymyelectrics'] = async (result = { user: { _id: '' } }) => {
    AppStoreBymyelectrics.Data.user.main.model.user = result.user;
  };
};

export { LogOutBymyelectrics };
