import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';

const SocketIoHealthcare = SocketIoHandlerProvider.create(AppStoreHealthcare);

export { SocketIoHealthcare };
