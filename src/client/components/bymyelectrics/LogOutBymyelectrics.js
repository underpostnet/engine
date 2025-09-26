import { LogOut } from '../core/LogOut.js';
import { ElementsBymyelectrics } from './ElementsBymyelectrics.js';

const LogOutBymyelectrics = async function () {
  LogOut.Event['LogOutBymyelectrics'] = async (result = { user: { _id: '' } }) => {
    ElementsBymyelectrics.Data.user.main.model.user = result.user;
  };
};

export { LogOutBymyelectrics };
