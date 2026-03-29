import { SocketIoHandlerProvider } from '../core/SocketIoHandler.js';
import { AppStoreNexodev } from './AppStoreNexodev.js';

const SocketIoNexodev = SocketIoHandlerProvider.create(AppStoreNexodev);

export { SocketIoNexodev };
