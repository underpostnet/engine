import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreDefault } from './AppStoreDefault.js';

const SocketIoDefault = SocketIoHandler(AppStoreDefault);

export { SocketIoDefault };
