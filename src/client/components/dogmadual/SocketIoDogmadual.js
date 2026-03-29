import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreDogmadual } from './AppStoreDogmadual.js';

const SocketIoDogmadual = SocketIoHandlerProvider.create(AppStoreDogmadual);

export { SocketIoDogmadual };
