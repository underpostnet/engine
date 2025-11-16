import { LogOut } from '../core/LogOut.js';
import { s } from '../core/VanillaJs.js';
import { ElementsCyberiaPortal } from './ElementsCyberiaPortal.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';

const LogOutCyberiaPortal = async function () {
  LogOut.Event['LogOutCyberiaPortal'] = async (result = { user: { _id: '' } }) => {
    ElementsCyberiaPortal.Data.user.main.model.user = result.user;
    s(`.main-btn-admin`).classList.add('hide');
    await ObjectLayerManagement.Reload('viewer');
  };
};

export { LogOutCyberiaPortal };
