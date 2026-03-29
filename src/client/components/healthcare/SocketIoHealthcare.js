import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';

const SocketIoHealthcare = SocketIoHandler(ElementsHealthcare);

export { SocketIoHealthcare };
