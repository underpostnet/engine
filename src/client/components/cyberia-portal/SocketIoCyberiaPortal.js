import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreCyberiaPortal } from './AppStoreCyberiaPortal.js';

const SocketIoCyberiaPortal = SocketIoHandlerProvider.create(AppStoreCyberiaPortal);

export { SocketIoCyberiaPortal };
