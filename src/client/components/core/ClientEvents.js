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

export {
  AuthEventType,
  SessionEventType,
  SocketEventType,
  TranslateEventType,
  ResponsiveEventType,
  RecoverEventType,
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
};