import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

const SocketIoItemledger = SocketIoHandlerProvider.create(AppStoreItemledger);

export { SocketIoItemledger };
