import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreCryptokoyn } from './AppStoreCryptokoyn.js';

const SocketIoCryptokoyn = SocketIoHandler(AppStoreCryptokoyn);

export { SocketIoCryptokoyn };
