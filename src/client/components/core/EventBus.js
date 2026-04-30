class EventBus {
  constructor() {
    this.target = new EventTarget();
    this.listeners = new Map();
    this.typeKeys = new Map();
    this.bridges = new Map();
  }

  ensureBridge(type) {
    if (this.bridges.has(type)) return;

    const bridge = async (event) => {
      const deferred = event._deferred;

      try {
        const keys = [...(this.typeKeys.get(type) ?? [])];
        for (const key of keys) {
          const entry = this.listeners.get(key);
          if (!entry) continue;

          await entry.listener(event.detail, event);
          if (entry.once) this.off(key);
        }

        deferred?.resolve();
      } catch (error) {
        deferred?.reject(error);
      }
    };

    this.bridges.set(type, bridge);
    this.target.addEventListener(type, bridge);
  }

  on(type, listener, options = {}) {
    const key = options.key ?? Symbol(type);

    this.off(key);
    this.ensureBridge(type);

    const keys = this.typeKeys.get(type) ?? new Set();
    keys.add(key);
    this.typeKeys.set(type, keys);

    this.listeners.set(key, {
      type,
      listener,
      once: Boolean(options.once),
    });

    return () => this.off(key);
  }

  off(key) {
    const entry = this.listeners.get(key);
    if (!entry) return false;

    this.listeners.delete(key);
    const keys = this.typeKeys.get(entry.type);
    if (keys) {
      keys.delete(key);
      if (keys.size === 0) this.typeKeys.delete(entry.type);
    }

    return true;
  }

  has(key) {
    return this.listeners.has(key);
  }

  async emit(type, detail) {
    if (!(this.typeKeys.get(type)?.size > 0)) return;

    const event = new CustomEvent(type, { detail });
    return await new Promise((resolve, reject) => {
      event._deferred = { resolve, reject };
      this.target.dispatchEvent(event);
    });
  }

  async emitKey(key, detail) {
    const entry = this.listeners.get(key);
    if (!entry) return;

    const event = new CustomEvent(entry.type, { detail });
    await entry.listener(detail, event);
    if (entry.once) this.off(key);
  }
}

export { EventBus };