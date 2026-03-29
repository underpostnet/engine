import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';

const SocketIoCyberiaPortal = SocketIoHandler(AppStoreCyberiaPortal);

export { SocketIoCyberiaPortal };
