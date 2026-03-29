import { LogOut } from '../core/LogOut.js';
import { AppStoreDogmadual } from './AppStoreDogmadual.js';

const LogOutDogmadual = async function () {
  LogOut.Event['LogOutDogmadual'] = async (result = { user: { _id: '' } }) => {
    AppStoreDogmadual.Data.user.main.model.user = result.user;
  };
};

export { LogOutDogmadual };
