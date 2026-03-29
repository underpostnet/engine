import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreCryptokoyn } from './AppStoreCryptokoyn.js';

const SocketIoCryptokoyn = SocketIoHandlerProvider.create(AppStoreCryptokoyn);

export { SocketIoCryptokoyn };
