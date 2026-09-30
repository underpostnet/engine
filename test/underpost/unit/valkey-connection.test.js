import { describe, it, expect, vi } from 'vitest';

// A client that answers the connectivity probe and records how it is closed.
const clients = vi.hoisted(() => []);
vi.mock('iovalkey', () => ({
  default: class {
    constructor() {
      this.listeners = {};
      this.disconnect = vi.fn();
      clients.push(this);
    }
    on(event, listener) {
      this.listeners[event] = listener;
    }
    removeAllListeners(event) {
      delete this.listeners[event];
    }
    async set() {}
    async get() {}
    async del() {}
  },
}));
vi.mock('../../../src/index.js', () => ({ default: {} }));
vi.mock('../../../src/server/runtime/runtime-status.js', () => ({ latchRuntimeError: () => {} }));

const { ValkeyAPI, closeValkeyConnection, createValkeyConnection } = await import('../../../src/db/valkey/Valkey.js');

describe('valkey connection lifecycle', () => {
  it('closes the client of an instance and forgets it, so the process can exit', async () => {
    const instance = { host: 'www.cyberiaonline.com', path: '/' };
    await createValkeyConnection(instance, { host: '127.0.0.1', port: 6379 });
    expect(ValkeyAPI.isConnected(instance)).toBe(true);

    closeValkeyConnection(instance);
    const [client] = clients;
    expect(client.disconnect).toHaveBeenCalledOnce();
    expect(client.listeners.end).toBeUndefined();
    expect(ValkeyAPI.isConnected(instance)).toBe(false);
    expect(() => ValkeyAPI.client(instance)).toThrow(/not connected/);

    closeValkeyConnection(instance);
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});
