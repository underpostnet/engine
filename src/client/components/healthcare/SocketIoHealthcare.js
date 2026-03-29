import { SocketIoHandler } from '../core/SocketIoHandler.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';

const SocketIoHealthcare = SocketIoHandler(AppStoreHealthcare);

export { SocketIoHealthcare };
