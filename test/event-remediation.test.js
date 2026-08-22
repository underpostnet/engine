'use strict';

import { expect } from 'chai';
import fs from 'node:fs';
import Underpost from '../src/index.js';
import { assertEventSchedules, eventSchedule } from '../src/server/event-notification.js';
import UnderpostEvent, {
  assertHubManagementConnection,
  probeDetail,
  eventCooldownKeyFactory,
  eventFirewallCommandsFactory,
  eventServicePortFactory,
} from '../src/cli/event.js';
import { UNDERPOST_MONITORING } from '../src/server/monitoring.js';

describe('event remediation', () => {
  it('keeps the dispatcher available when WireGuard is down', () => {
    const unit = UnderpostEvent.API.serviceUnitFactory({
      execPath: '/usr/bin/node',
      workingDirectory: '/opt/underpost/engine',
      user: 'root',
    });
    expect(unit).to.include('After=network-online.target');
    expect(unit).to.include('WantedBy=multi-user.target');
    expect(unit).to.include('Environment=PATH=/usr/bin:');
    expect(unit).to.include(`--port ${UNDERPOST_MONITORING.eventWebhook.port}`);
    expect(unit).to.include('Restart=on-failure');
    expect(unit).to.include('StartLimitBurst=5');
    expect(unit).to.not.include('wg-quick@');
    expect(unit).to.not.include('PartOf=');
  });

  it('applies cooldown independently to each failed spoke', () => {
    const alert = (spoke) => ({ labels: { underpost_spoke: spoke } });
    expect(eventCooldownKeyFactory('wireguard-spoke-down', [alert('homelab-a')])).to.equal(
      'wireguard-spoke-down:homelab-a',
    );
    expect(eventCooldownKeyFactory('wireguard-spoke-down', [alert('worker-a')])).to.equal(
      'wireguard-spoke-down:worker-a',
    );
  });

  it('opens and closes only the configured dispatcher port', () => {
    const port = UNDERPOST_MONITORING.eventWebhook.port;
    expect(eventFirewallCommandsFactory().join('\n')).to.include(`--add-port=${port}/tcp`);
    expect(eventFirewallCommandsFactory({ remove: true }).join('\n')).to.include(`--remove-port=${port}/tcp`);
  });

  it('reads the previous service port for firewall migration', () => {
    expect(
      eventServicePortFactory('[Service]\nExecStart=/usr/bin/node /home/dd/engine/bin event --serve --port 9099\n'),
    ).to.equal(9099);
    expect(eventServicePortFactory('[Service]\nExecStart=/usr/bin/node app.js\n')).to.equal(0);
  });

  it('rejects a VPS repair connection that uses the spoke-forward port', () => {
    expect(() =>
      assertHubManagementConnection({
        hubHost: '64.176.25.136',
        sshForwardPort: 2222,
        connection: { user: 'root', host: '64.176.25.136', port: 2222 },
      }),
    ).to.throw('collides with the spoke-forward port');
  });

  it('refuses to provision detection without a remediation route', () => {
    expect(() =>
      UnderpostEvent.API.assertRemediationReady([
        {
          remediation: [
            {
              role: 'hub',
              via: 'unresolved',
              error: 'no SSH connection is registered for the WireGuard hub',
            },
          ],
        },
      ]),
    ).to.throw('no SSH connection is registered for the WireGuard hub');

    const definitions = [{ remediation: [{ role: 'spoke', via: 'local' }] }];
    expect(UnderpostEvent.API.assertRemediationReady(definitions)).to.equal(definitions);
  });

  it('labels dry-run notifications as planned instead of remediated', () => {
    const notification = UnderpostEvent.API.notificationFactory({
      eventId: 'wireguard-spoke-down',
      result: {
        ok: true,
        role: 'spoke',
        condition: 'test',
        targets: [
          {
            role: 'spoke',
            spokeId: 'homelab-a',
            address: '10.0.0.2',
            via: 'local',
            commands: ['node bin wireguard --wireguard-restart --check'],
            ok: true,
            output: '[dry-run] local',
          },
        ],
      },
    });
    expect(notification.subject).to.include('planned');
    expect(notification.text).to.include('no command executed');
  });
});

describe('event end-to-end rehearsal', () => {
  it('loads a scenario per registered event id, each implementing the contract', async () => {
    for (const eventId of Object.keys(UnderpostEvent.API.EVENTS)) {
      const scenario = await UnderpostEvent.API.e2eScenario(eventId);
      expect(scenario.description, eventId).to.be.a('string');
      for (const method of ['subjects', 'break', 'restore'])
        expect(scenario[method], `${eventId}.${method}`).to.be.a('function');
    }
  });

  it('reports the path it expected rather than failing on an import', async () => {
    try {
      await UnderpostEvent.API.e2eScenario('not-an-event');
      expect.fail('an unknown event id must not resolve a scenario');
    } catch (error) {
      expect(error.message).to.include('test/event-e2e-not-an-event.js');
    }
  });

  it('refuses the flags that would leave nothing repaired or nothing verified', async () => {
    for (const [options, reason] of [
      [{ dryRun: true }, 'not compatible with --dry-run'],
      [{ notify: false }, 'not compatible with --no-notify'],
    ]) {
      try {
        await UnderpostEvent.API.e2e('wireguard-server-down', options);
        expect.fail(`${reason} was accepted`);
      } catch (error) {
        expect(error.message).to.include(reason);
      }
    }
  });
});

describe('probe observation reporting', () => {
  const down = { target: '10.0.0.3', success: false, read: true };

  it('reports the elapsed time only when the wait actually succeeded', () => {
    expect(probeDetail({ ok: true, readable: true, elapsedMs: 1200, observations: [down] }, 'answered again')).to.equal(
      'probes answered again after 1200ms',
    );
  });

  it('never claims a failed wait answered', () => {
    const detail = probeDetail(
      { ok: false, readable: true, elapsedMs: 180136, observations: [down] },
      'answered again',
    );
    expect(detail).to.include('never answered again within 180136ms');
    expect(detail).to.include('10.0.0.3 probe_success=0');
  });

  it('names an unreadable exporter instead of blaming the subject', () => {
    const detail = probeDetail(
      { ok: false, readable: false, elapsedMs: 60082, observations: [{ ...down, read: false, error: 'ECONNREFUSED' }] },
      'answered again',
    );
    expect(detail).to.include('Blackbox Exporter could not be read');
    expect(detail).to.include('ECONNREFUSED');
    expect(detail).to.not.include('probe_success');
  });
});

describe('public ingress classification', () => {
  const health = (results) => {
    const failing = results.filter((entry) => !entry.ok);
    return {
      state:
        results.length === 0 || failing.length === 0
          ? 'healthy'
          : failing.length === results.length
            ? 'down'
            : 'partial',
      total: results.length,
      healthy: results.length - failing.length,
      failing,
    };
  };
  const probe = (url, statuses) => ({ url, statuses, ok: statuses[statuses.length - 1] === '200' });

  it('treats the final code of a redirect chain as the answer', () => {
    expect(probe('a', ['302', '200']).ok).to.equal(true);
    expect(probe('b', ['301']).ok).to.equal(false);
    expect(probe('c', ['000']).ok).to.equal(false);
  });

  it('separates a per-host fault from an edge outage', () => {
    expect(health([probe('a', ['200']), probe('b', ['200'])]).state).to.equal('healthy');
    expect(health([probe('a', ['200']), probe('b', ['000'])]).state).to.equal('partial');
    expect(health([probe('a', ['000']), probe('b', ['503'])]).state).to.equal('down');
  });

  it('registers the event with an http probe over every published host', () => {
    const event = UnderpostEvent.API.EVENTS['public-ingress-down'];
    expect(event.role).to.equal('ingress');
    expect(event.alert.expr).to.include('underpost_event="public-ingress-down"');
  });
});

describe('event schedule contract', () => {
  const conf = {
    events: {
      'wireguard-spoke-down': { probeInterval: '30s', alertFor: '2m' },
      'public-ingress-down': { probeInterval: '10m' },
    },
  };

  it('reads both cadences from the one declaration', () => {
    expect(eventSchedule('wireguard-spoke-down', conf)).to.deep.equal({ probeInterval: '30s', alertFor: '2m' });
  });

  it('reports an undeclared event rather than inventing a cadence', () => {
    expect(eventSchedule('absent', conf)).to.deep.equal({ probeInterval: '', alertFor: '' });
  });

  it('refuses to publish a rule whose window the contract never declared', () => {
    expect(() =>
      assertEventSchedules([{ id: 'public-ingress-down', schedule: eventSchedule('public-ingress-down', conf) }]),
    ).to.throw('public-ingress-down: alertFor');
  });

  it('accepts a fully declared schedule', () => {
    expect(
      assertEventSchedules([{ id: 'wireguard-spoke-down', schedule: eventSchedule('wireguard-spoke-down', conf) }]),
    ).to.have.lengthOf(1);
  });

  it('keeps the alert window out of the registry so it cannot disagree', () => {
    for (const event of Object.values(UnderpostEvent.API.EVENTS)) expect(event.alert.for).to.equal(undefined);
  });
});

describe('incremental deployment against cluster state', () => {
  let readDeployedEventIds;
  const cluster = (ids) => {
    Underpost.monitor.readDeployedEventIds = () => ids;
  };

  beforeEach(() => {
    readDeployedEventIds = Underpost.monitor.readDeployedEventIds;
  });
  afterEach(() => {
    Underpost.monitor.readDeployedEventIds = readDeployedEventIds;
  });

  it('merges the named event into what the cluster already runs', () => {
    cluster(['public-ingress-down']);
    expect(UnderpostEvent.API.deploySelection('wireguard-spoke-down', {})).to.deep.equal([
      'public-ingress-down',
      'wireguard-spoke-down',
    ]);
  });

  it('is idempotent for an event already deployed', () => {
    cluster(['public-ingress-down']);
    expect(UnderpostEvent.API.deploySelection('public-ingress-down', {})).to.deep.equal(['public-ingress-down']);
  });

  it('withdraws only the named event', () => {
    cluster(['public-ingress-down', 'wireguard-spoke-down']);
    expect(UnderpostEvent.API.deploySelection('public-ingress-down', {}, true)).to.deep.equal(['wireguard-spoke-down']);
  });

  it('drops an id the registry no longer declares instead of failing the publish', () => {
    cluster(['public-ingress-down', 'retired-event']);
    expect(UnderpostEvent.API.deploySelection('wireguard-spoke-down', {})).to.not.include('retired-event');
  });

  it('reports declared, deployed and orphaned events apart', () => {
    cluster(['public-ingress-down', 'retired-event']);
    const status = Object.fromEntries(UnderpostEvent.API.deploymentStatus({}).map((row) => [row.id, row.status]));
    expect(status['public-ingress-down']).to.equal('DEPLOYED');
    expect(status['wireguard-spoke-down']).to.equal('PENDING');
    expect(status['retired-event']).to.equal('OUT_OF_SYNC');
  });
});

describe('public ingress recovery wait', () => {
  it('polls for the edge to carry traffic again instead of reading the verdict once', () => {
    const source = fs.readFileSync(new URL('../src/cli/event.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('async repairPublicIngress('));
    const method = body.slice(0, body.indexOf('\n    },'));
    expect(method).to.include('await Underpost.event.awaitPublicIngressHealth()');
    expect(method).to.not.include('Underpost.event.publicIngressHealth()\n      ;');
  });

  it('gives the edge longer than one probe pass to come back', () => {
    const source = fs.readFileSync(new URL('../src/cli/event.js', import.meta.url), 'utf8');
    const match = /PUBLIC_INGRESS_RECOVERY = \{ timeoutMs: (\d+)/.exec(source);
    expect(Number(match?.[1])).to.be.greaterThan(60000);
  });
});
