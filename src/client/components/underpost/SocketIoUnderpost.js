import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';

const SocketIoUnderpost = SocketIoHandlerProvider.create(AppStoreUnderpost);

export { SocketIoUnderpost };
