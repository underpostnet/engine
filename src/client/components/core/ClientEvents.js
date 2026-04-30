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
