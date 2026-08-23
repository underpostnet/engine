import fs from 'fs-extra';
import { resolveConfSecrets } from '../runtime/conf.js';
import { loggerFactory } from './logger.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';

/**
 * The notification contract for operational events.
 *
 * Detection and remediation are declared in code because they are behaviour;
 * who hears about them is deployment data, and lives in
 * `engine-private/deploy/conf.event.json`. Adding a subscriber or repointing a
 * transport is therefore a configuration change, and no recipient address or
 * credential reaches the event registry, a rendered manifest, or this
 * repository.
 *
 * @module src/server/ops/event-notification.js
 * @namespace UnderpostEventNotification
 */

const logger = loggerFactory(import.meta);

/**
 * @constant EVENT_CONF_PATH
 * @description The notification contract, read relative to the engine checkout
 * every command already resolves its deploy configuration from.
 * @memberof UnderpostEventNotification
 */
const EVENT_CONF_PATH = './engine-private/deploy/conf.event.json';

const EMPTY_CONF = { 'notification-providers': {}, events: {} };

/** What a rule writes where its declared threshold belongs. */
const THRESHOLD_TOKEN = '<threshold>';

/**
 * @method readEventConf
 * @description Parses the contract without resolving `env:` references.
 *
 * Structure and secrets are read apart so the shape can be listed, validated
 * and tested on a machine that holds none of the credentials.
 * @returns {{'notification-providers': object, events: object}} Parsed contract.
 * @throws {Error} When the file exists but does not parse.
 * @memberof UnderpostEventNotification
 */
const readEventConf = () => {
  if (!fs.existsSync(EVENT_CONF_PATH)) return { ...EMPTY_CONF };
  try {
    const source = JSON.parse(fs.readFileSync(EVENT_CONF_PATH, 'utf8'));
    return {
      'notification-providers': source['notification-providers'] || {},
      events: source.events || {},
    };
  } catch (error) {
    throw new Error(`[event] invalid notification contract ${EVENT_CONF_PATH}: ${error.message}`);
  }
};

const recipientFactory = (subscriber = {}) => {
  const email = `${subscriber.email || ''}`.trim();
  const name = `${subscriber.name || ''}`.trim();
  return email ? { email, name, address: name ? `${name} <${email}>` : email } : undefined;
};

/**
 * @constant NOTIFICATION_PROVIDER_TYPES
 * @description The transports a notification route can name.
 *
 * `describe` renders the route for `--list` and validates it; `deliver` sends
 * one rendered notification. A type is one entry here, so adding a transport
 * never means editing the dispatcher.
 * @memberof UnderpostEventNotification
 */
const NOTIFICATION_PROVIDER_TYPES = {
  mailer: {
    describe: (provider) => {
      const transport = provider?.mailer?.transport || {};
      const host = `${transport.host || ''}`.replace(/^env:.*/, '(env)');
      if (!transport.host) throw new Error('mailer provider has no transport.host');
      if (!provider?.mailer?.sender?.email) throw new Error('mailer provider has no sender.email');
      return `smtp ${host}`;
    },
    deliver: async ({ providerId, provider, recipients, subject, text }) => {
      const mailer = resolveConfSecrets(provider.mailer);
      const port = Number(mailer.transport?.port) || 587;
      const id = `event-notification:${providerId}`;

      await MailerProvider.load({
        id,
        sender: { email: mailer.sender.email, name: mailer.sender.name || 'Underpost' },
        transport: {
          host: mailer.transport.host,
          port,
          secure: `${mailer.transport?.secure}` === 'true' || port === 465,
          auth: { user: mailer.transport?.auth?.user || '', pass: mailer.transport?.auth?.pass || '' },
        },
        templates: {},
      });

      // Plain text by design: an operational alert must not depend on a client
      // build being present on the host that dispatches it.
      try {
        const info = await MailerProvider.send({
          id,
          sendOptions: { to: recipients.map((recipient) => recipient.address).join(', '), subject, text },
        });
        return Boolean(info);
      } finally {
        // One delivery per dispatch: an open SMTP socket would outlive the
        // command that sent it and keep the process from exiting.
        MailerProvider.close(id);
      }
    },
  },
};

/**
 * @method eventNotificationRoutes
 * @description Resolves where one event's notifications go.
 *
 * An unresolvable route is returned carrying its reason rather than thrown, so
 * `--list` can show a broken contract before an outage does.
 * @param {string} eventId - Registered event id.
 * @param {object} [conf] - Parsed contract; read from disk when omitted.
 * @returns {Array<{providerId: string, type: string, target: string, recipients: Array<object>, error?: string}>} Routes.
 * @memberof UnderpostEventNotification
 */
const eventNotificationRoutes = (eventId, conf = readEventConf()) => {
  const providers = conf['notification-providers'] || {};
  const notifications = conf.events?.[eventId]?.notifications || [];

  if (notifications.length === 0)
    return [
      {
        providerId: '',
        type: '',
        target: '',
        recipients: [],
        error: `no notification is declared for '${eventId}' in ${EVENT_CONF_PATH}`,
      },
    ];

  return notifications.map((notification) => {
    const providerId = `${notification['notification-provider-id'] || ''}`;
    const provider = providers[providerId];
    const recipients = (notification.payload?.subscribers || []).map(recipientFactory).filter(Boolean);
    const route = { providerId, type: `${provider?.type || ''}`, target: '', recipients };

    if (!provider)
      return { ...route, error: `notification-provider-id '${providerId}' is not declared in ${EVENT_CONF_PATH}` };
    const type = NOTIFICATION_PROVIDER_TYPES[route.type];
    if (!type) return { ...route, error: `unsupported notification provider type '${route.type}'` };
    if (recipients.length === 0) return { ...route, error: `provider '${providerId}' has no subscriber with an email` };
    try {
      return { ...route, target: type.describe(provider), provider };
    } catch (error) {
      return { ...route, error: `provider '${providerId}': ${error.message}` };
    }
  });
};

/**
 * @method assertNotificationRoutes
 * @description Refuses a contract that cannot deliver.
 *
 * Detection without a route to a human is the failure mode this guards: the
 * remediation runs, nobody learns it ran, and a repeated repair goes unnoticed.
 * @param {Array<object>} routes - Resolved routes, keyed by event id.
 * @returns {Array<object>} The same routes, when every one resolves.
 * @throws {Error} Naming each unresolved route.
 * @memberof UnderpostEventNotification
 */
const assertNotificationRoutes = (routes = []) => {
  const unresolved = routes.filter((route) => route.error);
  if (unresolved.length > 0)
    throw new Error(
      `[event] notification routes are unresolved:\n${unresolved.map((route) => `- ${route.error}`).join('\n')}`,
    );
  return routes;
};

/**
 * @method deliverEventNotification
 * @description Sends one rendered notification over every route the event declares.
 *
 * Routes are independent subscribers: one failing transport must not silence
 * the rest, so each is attempted and reported separately.
 * @param {object} params
 * @param {string} params.eventId - Dispatched event id.
 * @param {string} params.subject - Rendered subject.
 * @param {string} params.text - Rendered body.
 * @returns {Promise<{ok: boolean, delivered: Array<object>, failed: Array<object>}>} Per-route outcome.
 * @memberof UnderpostEventNotification
 */
const deliverEventNotification = async ({ eventId, subject, text }) => {
  const routes = eventNotificationRoutes(eventId);
  const delivered = [];
  const failed = [];

  for (const route of routes) {
    const recipients = route.recipients.map((recipient) => recipient.email);
    if (route.error) {
      failed.push({ providerId: route.providerId, recipients, error: route.error });
      continue;
    }
    try {
      const ok = await NOTIFICATION_PROVIDER_TYPES[route.type].deliver({
        providerId: route.providerId,
        provider: route.provider,
        recipients: route.recipients,
        subject,
        text,
      });
      if (ok) delivered.push({ providerId: route.providerId, recipients });
      else failed.push({ providerId: route.providerId, recipients, error: 'transport rejected the message' });
    } catch (error) {
      failed.push({ providerId: route.providerId, recipients, error: `${error?.message || error}` });
    }
  }

  for (const route of failed) logger.error('Event notification not delivered', { eventId, ...route });
  if (delivered.length > 0) logger.info('Event notification delivered', { eventId, subject, routes: delivered });

  return { ok: failed.length === 0 && delivered.length > 0, delivered, failed };
};

/**
 * @method eventSchedule
 * @description When an event's probes run, and how long its condition must hold
 * before an alert fires.
 *
 * Both are declared per event in the contract rather than in the registry: how
 * often a subject is asked and how long it must stay wrong are operational
 * decisions tuned per deployment, and they are the two numbers Prometheus needs
 * to schedule a job and evaluate the rule that job feeds. Reading them from one
 * place is what stops a probe period and its alert window from drifting apart.
 * @param {string} eventId - Registered event id.
 * @param {object} [conf] - Parsed contract; read from disk when omitted.
 * @returns {{probeInterval: string, alertFor: string, threshold: string}} Declared schedule; empty when undeclared.
 * @memberof UnderpostEventNotification
 */
const eventSchedule = (eventId, conf = readEventConf()) => {
  const event = conf.events?.[eventId] || {};
  return {
    probeInterval: `${event.probeInterval || ''}`.trim(),
    alertFor: `${event.alertFor || ''}`.trim(),
    // A number the rule compares against: it belongs beside the cadence, not in
    // an expression, because tuning it is a deployment decision.
    threshold: `${event.threshold ?? ''}`.trim(),
  };
};

/**
 * @method assertEventSchedules
 * @description Refuses to publish a rule whose cadence the contract does not declare.
 *
 * An undeclared period would silently inherit the global scrape interval and an
 * undeclared window a hardcoded default — the second source of truth these
 * attributes exist to remove.
 * @param {Array<{id: string, schedule: object}>} [definitions] - Resolved definitions.
 * @returns {Array<object>} The same definitions, when every schedule is declared.
 * @throws {Error} Naming each event and the attribute it is missing.
 * @memberof UnderpostEventNotification
 */
const assertEventSchedules = (definitions = []) => {
  const missing = definitions.flatMap(({ id, alert = {}, schedule = {} }) =>
    ['probeInterval', 'alertFor', ...(`${alert.expr || ''}`.includes(THRESHOLD_TOKEN) ? ['threshold'] : [])]
      .filter((key) => !schedule[key])
      .map((key) => `- ${id}: ${key}`),
  );
  if (missing.length > 0) throw new Error(`[event] undeclared in ${EVENT_CONF_PATH}:\n${missing.join('\n')}`);
  return definitions;
};

export {
  EVENT_CONF_PATH,
  THRESHOLD_TOKEN,
  assertEventSchedules,
  eventSchedule,
  NOTIFICATION_PROVIDER_TYPES,
  assertNotificationRoutes,
  deliverEventNotification,
  eventNotificationRoutes,
  readEventConf,
};
