import { LogOut } from '../core/LogOut.js';
import { ElementsDogmadual } from './ElementsDogmadual.js';

const LogOutDogmadual = async function () {
  LogOut.Event['LogOutDogmadual'] = async (result = { user: { _id: '' } }) => {
    ElementsDogmadual.Data.user.main.model.user = result.user;
  };
};

export { LogOutDogmadual };
