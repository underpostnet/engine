import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreDefault } from './AppStoreDefault.js';

const SocketIoDefault = SocketIoHandlerProvider.create(AppStoreDefault);

export { SocketIoDefault };
