'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { MailerProvider, MailerProviderClass } from '../../../../src/mailer/MailerProvider.js';
import { mailerInterceptorFactory } from '../../../../src/mailer/MailerInterceptor.js';
import {
  EVENT_CONF_PATH,
  assertNotificationRoutes,
  deliverEventNotification,
  eventNotificationRoutes,
  readEventConf,
} from '../../../../src/server/ops/event-notification.js';

const CONF = {
  'notification-providers': {
    'default-cluster-mailer-provider': {
      type: 'mailer',
      mailer: {
        sender: { email: 'env:CLUSTER_MAILER_ADMIN_SENDER_EMAIL', name: 'env:CLUSTER_MAILER_ADMIN_SENDER_NAME' },
        transport: {
          host: 'env:CLUSTER_MAILER_SMTP_HOST',
          port: 'env:CLUSTER_MAILER_SMTP_PORT',
          secure: 'env:CLUSTER_SMTP_SECURE',
          auth: { user: 'env:CLUSTER_MAILER_SMTP_AUTH_USER', pass: 'env:CLUSTER_MAILER_SMTP_AUTH_PASS' },
        },
      },
    },
  },
  events: {
    'wireguard-server-down': {
      notifications: [
        {
          'notification-provider-id': 'default-cluster-mailer-provider',
          payload: { subscribers: [{ email: 'ops@example.com', name: 'Ops' }] },
        },
      ],
    },
  },
};

const loadedProviderFactory = async () => {
  const provider = new MailerProviderClass();
  await provider.load({
    id: 'test',
    sender: { email: 'sender@example.com', name: 'Sender' },
    transport: { host: 'smtp.example.com', port: 587, secure: false, auth: { user: '', pass: '' } },
    templates: {},
  });
  return provider;
};

describe('event notification contract', () => {
  it('resolves a declared route without reading any credential', () => {
    const [route] = eventNotificationRoutes('wireguard-server-down', CONF);
    expect(route.error).to.equal(undefined);
    expect(route.providerId).to.equal('default-cluster-mailer-provider');
    expect(route.type).to.equal('mailer');
    expect(route.target).to.equal('smtp (env)');
    expect(route.recipients).to.deep.equal([
      { email: 'ops@example.com', name: 'Ops', address: 'Ops <ops@example.com>' },
    ]);
  });

  it('reports an event that declares no notification', () => {
    const [route] = eventNotificationRoutes('wireguard-spoke-down', CONF);
    expect(route.error).to.include(EVENT_CONF_PATH);
    expect(route.error).to.include('wireguard-spoke-down');
  });

  it('reports a route naming an undeclared provider', () => {
    const conf = {
      ...CONF,
      events: { 'x-down': { notifications: [{ 'notification-provider-id': 'ghost', payload: {} }] } },
    };
    expect(eventNotificationRoutes('x-down', conf)[0].error).to.include("'ghost' is not declared");
  });

  it('reports a provider type nothing can deliver', () => {
    const conf = {
      'notification-providers': { pager: { type: 'pager' } },
      events: {
        'x-down': {
          notifications: [{ 'notification-provider-id': 'pager', payload: { subscribers: [{ email: 'a@b.com' }] } }],
        },
      },
    };
    expect(eventNotificationRoutes('x-down', conf)[0].error).to.include(
      "unsupported notification provider type 'pager'",
    );
  });

  it('reports a route with no subscriber to deliver to', () => {
    const conf = {
      ...CONF,
      events: {
        'x-down': {
          notifications: [
            {
              'notification-provider-id': 'default-cluster-mailer-provider',
              payload: { subscribers: [{ name: 'Ops' }] },
            },
          ],
        },
      },
    };
    expect(eventNotificationRoutes('x-down', conf)[0].error).to.include('no subscriber with an email');
  });

  it('refuses detection whose outcome would reach nobody', () => {
    expect(() => assertNotificationRoutes(eventNotificationRoutes('wireguard-spoke-down', CONF))).to.throw(
      'notification routes are unresolved',
    );
    expect(assertNotificationRoutes(eventNotificationRoutes('wireguard-server-down', CONF))).to.have.lengthOf(1);
  });

  it('reports a mailer provider without a transport host or a sender', () => {
    const conf = (mailer) => ({
      'notification-providers': { smtp: { type: 'mailer', mailer } },
      events: {
        'x-down': {
          notifications: [{ 'notification-provider-id': 'smtp', payload: { subscribers: [{ email: 'a@b.com' }] } }],
        },
      },
    });
    expect(eventNotificationRoutes('x-down', conf({ sender: { email: 'a@b.com' } }))[0].error).to.equal(
      "provider 'smtp': mailer provider has no transport.host",
    );
    expect(eventNotificationRoutes('x-down', conf({ transport: { host: 'smtp.b.com' } }))[0].error).to.equal(
      "provider 'smtp': mailer provider has no sender.email",
    );
  });
});

// The contract is deploy data read relative to the engine root, so these cases run in a fixture tree.
describe('event notification contract file', () => {
  const cwd = process.cwd();
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-event-conf-'));
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.removeSync(root);
  });

  it('reads an absent contract as one that declares nothing', () => {
    expect(readEventConf()).to.deep.equal({ 'notification-providers': {}, events: {} });
  });

  it('reads the providers and events of the contract, and defaults a missing section', () => {
    fs.outputJsonSync(EVENT_CONF_PATH, { events: CONF.events });
    expect(readEventConf()).to.deep.equal({ 'notification-providers': {}, events: CONF.events });
    fs.outputJsonSync(EVENT_CONF_PATH, CONF);
    expect(eventNotificationRoutes('wireguard-server-down')[0].target).to.equal('smtp (env)');
  });

  it('refuses a contract that does not parse', () => {
    fs.outputFileSync(EVENT_CONF_PATH, '{ events: ');
    expect(() => readEventConf()).to.throw(`invalid notification contract ${EVENT_CONF_PATH}`);
  });
});

describe('event notification delivery', () => {
  const cwd = process.cwd();
  let root;
  let interceptor;

  const writeConf = (events) =>
    fs.outputJsonSync(EVENT_CONF_PATH, {
      'notification-providers': {
        ops: {
          type: 'mailer',
          mailer: {
            sender: { email: 'alerts@example.com' },
            transport: { host: 'smtp.example.com', port: '465', auth: { user: 'env:EVENT_TEST_SMTP_USER' } },
          },
        },
      },
      events,
    });
  const route = (...emails) => ({
    'notification-provider-id': 'ops',
    payload: { subscribers: emails.map((email) => ({ email, name: 'Ops' })) },
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-event-delivery-'));
    process.chdir(root);
    vi.stubEnv('EVENT_TEST_SMTP_USER', 'smtp-user');
  });

  afterEach(() => {
    interceptor?.close();
    interceptor = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.chdir(cwd);
    fs.removeSync(root);
  });

  it('sends one plain text message over the mailer and releases its transport', async () => {
    writeConf({ 'x-down': { notifications: [route('a@example.com', 'b@example.com')] } });
    interceptor = mailerInterceptorFactory({ suppress: true });
    const load = vi.spyOn(MailerProvider, 'load');

    const outcome = await deliverEventNotification({ eventId: 'x-down', subject: 'x down', text: 'repaired' });

    expect(outcome).to.deep.equal({
      ok: true,
      delivered: [{ providerId: 'ops', recipients: ['a@example.com', 'b@example.com'] }],
      failed: [],
    });
    const [{ id, sendOptions }] = interceptor.messages;
    expect(id).to.equal('event-notification:ops');
    expect(sendOptions).to.include({
      to: 'Ops <a@example.com>, Ops <b@example.com>',
      subject: 'x down',
      text: 'repaired',
      from: 'Underpost <alerts@example.com>',
    });
    expect(load.mock.calls[0][0].transport).to.deep.equal({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'smtp-user', pass: '' },
    });
    expect(MailerProvider.instance[id]).to.equal(undefined);
  });

  it('reports an unresolved route as a failure and sends nothing over it', async () => {
    writeConf({ 'x-down': { notifications: [{ 'notification-provider-id': 'ghost' }] } });
    interceptor = mailerInterceptorFactory({ suppress: true });
    const outcome = await deliverEventNotification({ eventId: 'x-down', subject: 's', text: 't' });
    expect(outcome.ok).to.equal(false);
    expect(outcome.failed).to.have.lengthOf(1);
    expect(outcome.failed[0].error).to.include("'ghost' is not declared");
    expect(interceptor.messages).to.deep.equal([]);
  });

  it('reports a message the transport rejects, and a transport that fails to load', async () => {
    writeConf({ 'x-down': { notifications: [route('a@example.com')] } });
    const dispose = MailerProvider.use(async () => {
      throw new Error('550 rejected');
    });
    try {
      const rejected = await deliverEventNotification({ eventId: 'x-down', subject: 's', text: 't' });
      expect(rejected.failed).to.deep.equal([
        { providerId: 'ops', recipients: ['a@example.com'], error: 'transport rejected the message' },
      ]);
    } finally {
      dispose();
    }
    vi.spyOn(MailerProvider, 'load').mockRejectedValue(new Error('smtp unreachable'));
    const unreachable = await deliverEventNotification({ eventId: 'x-down', subject: 's', text: 't' });
    expect(unreachable).to.deep.equal({
      ok: false,
      delivered: [],
      failed: [{ providerId: 'ops', recipients: ['a@example.com'], error: 'smtp unreachable' }],
    });
  });
});

describe('mailer send middleware', () => {
  it('wraps a delivery in registration order and unregisters on dispose', async () => {
    const provider = await loadedProviderFactory();
    const order = [];
    const dispose = provider.use(async (context, next) => {
      order.push(`outer:${context.id}`);
      return await next();
    });
    // Suppressing the transport keeps the assertion on ordering, not on SMTP.
    provider.use(async () => {
      order.push('inner');
      return { messageId: 'stub' };
    });

    const info = await provider.send({ id: 'test', sendOptions: { to: 'a@b.com', subject: 'hi', text: 'hi' } });
    expect(info).to.deep.equal({ messageId: 'stub' });
    expect(order).to.deep.equal(['outer:test', 'inner']);

    dispose();
    order.length = 0;
    await provider.send({ id: 'test', sendOptions: { to: 'a@b.com', subject: 'hi', text: 'hi' } });
    expect(order).to.deep.equal(['inner']);
  });

  it('defaults the sender before any middleware observes the message', async () => {
    const provider = await loadedProviderFactory();
    let observed;
    provider.use(async (context) => {
      observed = context.sendOptions.from;
      return { messageId: 'stub' };
    });
    await provider.send({ id: 'test', sendOptions: { to: 'a@b.com', subject: 'hi', text: 'hi' } });
    expect(observed).to.equal('Sender <sender@example.com>');
  });
});

describe('mailer interceptor', () => {
  it('records what was sent and waits for a specific message', async () => {
    const provider = await loadedProviderFactory();
    const interceptor = mailerInterceptorFactory({ provider, suppress: true });

    const pending = interceptor.waitFor((message) => message.sendOptions.subject.includes('wireguard-server-down'), {
      timeoutMs: 2000,
      intervalMs: 10,
    });
    await provider.send({
      id: 'test',
      sendOptions: { to: 'ops@example.com', subject: '[underpost] wireguard-server-down — hub — remediated', text: '' },
    });

    const message = await pending;
    expect(message.accepted).to.equal(true);
    expect(message.sendOptions.to).to.equal('ops@example.com');
    expect(interceptor.messages).to.have.lengthOf(1);

    interceptor.close();
    provider.use(async () => ({ messageId: 'stub' }));
    await provider.send({ id: 'test', sendOptions: { to: 'ops@example.com', subject: 'later', text: '' } });
    expect(interceptor.messages).to.have.lengthOf(1);
  });

  it('resolves undefined when nothing matching is ever sent', async () => {
    const provider = await loadedProviderFactory();
    const interceptor = mailerInterceptorFactory({ provider, suppress: true });
    const message = await interceptor.waitFor(() => false, { timeoutMs: 60, intervalMs: 10 });
    interceptor.close();
    expect(message).to.equal(undefined);
  });
});

describe('mailer transport lifecycle', () => {
  it('releases the instance so a one-shot process can exit', async () => {
    const provider = await loadedProviderFactory();
    expect(provider.instance.test).to.be.an('object');
    expect(provider.close('test')).to.equal(true);
    expect(provider.instance.test).to.equal(undefined);
  });

  it('is a no-op for an instance that was never loaded', async () => {
    const provider = await loadedProviderFactory();
    expect(provider.close('absent')).to.equal(false);
  });

  it('keeps SMTP certificate verification on when the transport sets no TLS options', async () => {
    const provider = await loadedProviderFactory();
    expect(provider.instance.test.transporter.options.tls).to.equal(undefined);
    provider.close('test');
  });
});
