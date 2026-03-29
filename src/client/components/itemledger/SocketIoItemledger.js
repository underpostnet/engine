import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreItemledger } from './AppStoreItemledger.js';

const SocketIoItemledger = SocketIoHandler(AppStoreItemledger);

export { SocketIoItemledger };
