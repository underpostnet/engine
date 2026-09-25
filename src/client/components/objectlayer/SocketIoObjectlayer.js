import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreObjectlayer } from './AppStoreObjectlayer.js';

const SocketIoObjectlayer = SocketIoHandlerProvider.create(AppStoreObjectlayer);

export { SocketIoObjectlayer };
