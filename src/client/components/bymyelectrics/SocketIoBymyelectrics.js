import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

const SocketIoBymyelectrics = SocketIoHandlerProvider.create(AppStoreBymyelectrics);

export { SocketIoBymyelectrics };
