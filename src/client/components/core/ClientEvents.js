import { EventBus } from './EventBus.js';

const AuthEventType = {
  login: 'auth:login',
  logout: 'auth:logout',
  signup: 'auth:signup',
};

const SessionEventType = {
  updated: 'session:updated',
  cleared: 'session:cleared',
};

const SocketEventType = {
  connect: 'socket:connect',
  connectError: 'socket:connect-error',
  disconnect: 'socket:disconnect',
  channel: (channel) => `socket:channel:${channel}`,
};

const TranslateEventType = {
  changed: 'translate:changed',
};

const ResponsiveEventType = {
  changed: 'responsive:changed',
  settled: 'responsive:settled',
  orientationChanged: 'responsive:orientation:changed',
  orientationSettled: 'responsive:orientation:settled',
};

const RecoverEventType = {
  triggered: 'recover:triggered',
};

const KeyboardEventType = {
  pressed: 'keyboard:pressed',
};

const AccountEventType = {
  updated: 'account:updated',
};

const AppointmentEventType = {
  submitted: 'appointment:submitted',
};

const ModalEventType = {
  close: 'modal:close',
  menu: 'modal:menu',
  collapseMenu: 'modal:collapse-menu',
  extendMenu: 'modal:extend-menu',
  dragEnd: 'modal:drag-end',
  observer: 'modal:observer',
  click: 'modal:click',
  expandUi: 'modal:expand-ui',
  barUiOpen: 'modal:bar-ui-open',
  barUiClose: 'modal:bar-ui-close',
  reload: 'modal:reload',
  home: 'modal:home',
};

// Legacy listener-map property name -> event type. Each Modal instance exposes
// these names so existing consumers keep using `Modal.Data[id].onXListener[key]`.
const ModalListenerChannels = {
  onCloseListener: ModalEventType.close,
  onMenuListener: ModalEventType.menu,
  onCollapseMenuListener: ModalEventType.collapseMenu,
  onExtendMenuListener: ModalEventType.extendMenu,
  onDragEndListener: ModalEventType.dragEnd,
  onObserverListener: ModalEventType.observer,
  onClickListener: ModalEventType.click,
  onExpandUiListener: ModalEventType.expandUi,
  onBarUiOpen: ModalEventType.barUiOpen,
  onBarUiClose: ModalEventType.barUiClose,
  onReloadModalListener: ModalEventType.reload,
  onHome: ModalEventType.home,
};

// Adapter exposing an EventBus type as a plain `{ [key]: listener }` map.
// Reading a key returns a callable that emits to that single listener; assigning
// registers it; deleting removes it; enumeration lists registered keys. This
// keeps the historical object-map ergonomics while the bus owns dispatch.
const createModalEventChannel = (bus, type) => {
  const busKey = (key) => `${type}::${key}`;
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol') return undefined;
        const key = busKey(prop);
        if (!bus.has(key)) return undefined;
        return (detail) => bus.emitKey(key, detail);
      },
      set(_target, prop, value) {
        if (typeof prop !== 'symbol' && typeof value === 'function') bus.on(type, value, { key: busKey(prop) });
        return true;
      },
      deleteProperty(_target, prop) {
        if (typeof prop !== 'symbol') bus.off(busKey(prop));
        return true;
      },
      has(_target, prop) {
        return typeof prop !== 'symbol' && bus.has(busKey(prop));
      },
      ownKeys() {
        const prefix = `${type}::`;
        return bus.keysOf(type).map((key) => String(key).slice(prefix.length));
      },
      getOwnPropertyDescriptor(_target, prop) {
        if (typeof prop !== 'symbol' && bus.has(busKey(prop)))
          return { enumerable: true, configurable: true, writable: true, value: undefined };
        return undefined;
      },
    },
  );
};

// One EventBus per modal id, surfaced through the legacy channel names.
const createModalEvents = () => {
  const bus = new EventBus();
  const channels = {};
  for (const [name, type] of Object.entries(ModalListenerChannels)) channels[name] = createModalEventChannel(bus, type);
  return { bus, channels };
};

const authLoginEvents = new EventBus();
const authLogoutEvents = new EventBus();
const authSignupEvents = new EventBus();
const sessionEvents = new EventBus();
const socketEvents = new EventBus();
const translateEvents = new EventBus();
const responsiveChangeEvents = new EventBus();
const responsiveSettledEvents = new EventBus();
const responsiveOrientationEvents = new EventBus();
const responsiveOrientationSettledEvents = new EventBus();
const recoverEvents = new EventBus();
const keyboardEvents = new EventBus();
const accountEvents = new EventBus();
const appointmentEvents = new EventBus();

export {
  AuthEventType,
  SessionEventType,
  SocketEventType,
  TranslateEventType,
  ResponsiveEventType,
  RecoverEventType,
  KeyboardEventType,
  AccountEventType,
  AppointmentEventType,
  ModalEventType,
  ModalListenerChannels,
  createModalEvents,
  authLoginEvents,
  authLogoutEvents,
  authSignupEvents,
  sessionEvents,
  socketEvents,
  translateEvents,
  responsiveChangeEvents,
  responsiveSettledEvents,
  responsiveOrientationEvents,
  responsiveOrientationSettledEvents,
  recoverEvents,
  keyboardEvents,
  accountEvents,
  appointmentEvents,
};
