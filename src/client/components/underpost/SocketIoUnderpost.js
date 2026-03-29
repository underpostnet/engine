import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreUnderpost } from './AppStoreUnderpost.js';

const SocketIoUnderpost = SocketIoHandler(AppStoreUnderpost);

export { SocketIoUnderpost };
