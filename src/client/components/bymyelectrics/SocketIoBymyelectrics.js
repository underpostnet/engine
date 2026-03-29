import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreBymyelectrics } from './AppStoreBymyelectrics.js';

const SocketIoBymyelectrics = SocketIoHandler(AppStoreBymyelectrics);

export { SocketIoBymyelectrics };
