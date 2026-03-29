import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { ElementsItemledger } from './ElementsItemledger.js';

const SocketIoItemledger = SocketIoHandler(ElementsItemledger);

export { SocketIoItemledger };
