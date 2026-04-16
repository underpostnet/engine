import { LogOut } from '../core/LogOut.js';
import { AppStoreCecinasmarcelina } from './AppStoreCecinasmarcelina.js';

const LogOutCecinasmarcelina = async function () {
  LogOut.Event['LogOutCecinasmarcelina'] = async (result = { user: { _id: '' } }) => {
    AppStoreCecinasmarcelina.Data.user.main.model.user = result.user;
  };
};

export { LogOutCecinasmarcelina };
