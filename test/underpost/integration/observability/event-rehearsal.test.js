'use strict';

import { expect } from 'chai';
import shell from 'shelljs';
import { vi } from 'vitest';
import Underpost from '../../../../src/index.js';
import UnderpostEvent, { EVENT_E2E } from '../../../../src/cli/event.js';

const EVENT_ID = 'wireguard-server-down';
const event = () => UnderpostEvent.API;

// The doubles of one rehearsal: probe answers in order, the fault scenario, and the mail it watches.
const rehearsalFactory = ({ probes = [], broken = { ok: true, output: 'stopped' }, mail = true } = {}) => {
  const answers = [...probes];
  const awaitProbes = vi.spyOn(Underpost.monitor, 'awaitProbes').mockImplementation(async () => answers.shift());
  const messages = [{ sendOptions: { subject: `[underpost] ${EVENT_ID} earlier`, to: 'ops@example.com' } }];
  const dispatch = vi.spyOn(Underpost.event, 'dispatch').mockImplementation(async () => {
    if (mail)
      messages.push({
        accepted: true,
        sendOptions: { subject: `[underpost] ${EVENT_ID} — hub — remediated`, to: 'ops@example.com' },
      });
    return { ok: true, condition: 'tunnel restored' };
  });
  const scenario = {
    description: 'stops the hub tunnel',
    break: vi.fn(async () => broken),
    restore: vi.fn(async () => ({ ok: true })),
  };
  const interceptor = {
    messages,
    waitFor: async (match) => messages.find((message, index) => match(message, index)) ?? null,
  };
  const subject = { label: 'hub', probes: [{ target: '10.0.0.1' }], dispatchOptions: { spoke: 'hub' } };
  const context = {
    namespace: 'ns',
    options: { env: 'production' },
    controlTarget: { user: 'root', host: 'control', via: 'ssh' },
  };
  const run = () => event().e2eSubject({ eventId: EVENT_ID, subject, scenario, context, interceptor });
  return { awaitProbes, dispatch, scenario, run };
};

const up = { ok: true, readable: true, elapsedMs: 10, observations: [] };
const down = {
  ok: false,
  readable: true,
  elapsedMs: 20,
  observations: [{ target: '10.0.0.1', success: true, read: true }],
};
const steps = (result) => result.map(({ name, ok }) => `${name}:${ok}`);

describe('event rehearsal of one subject', () => {
  afterEach(() => vi.restoreAllMocks());

  it('breaks, detects, remediates, recovers and finds the notification of this dispatch', async () => {
    const { awaitProbes, dispatch, scenario, run } = rehearsalFactory({ probes: [up, up, up] });
    expect(steps(await run())).to.deep.equal([
      'baseline:true',
      'arrange:true',
      'detect:true',
      'act:true',
      'recover:true',
      'notify:true',
    ]);
    expect(awaitProbes.mock.calls.map(([options]) => options.expect)).to.deep.equal([true, false, true]);
    expect(awaitProbes.mock.calls[0][0]).to.deep.include({
      namespace: 'ns',
      timeoutMs: EVENT_E2E.baselineTimeoutMs,
      target: { user: 'root', host: 'control' },
    });
    expect(dispatch).toHaveBeenCalledWith(EVENT_ID, { env: 'production', spoke: 'hub' });
    // The remediation restored the subject, so the rehearsal leaves it alone.
    expect(scenario.restore).not.toHaveBeenCalled();
  });

  it('stops before the fault when the subject is already down', async () => {
    const { scenario, run } = rehearsalFactory({ probes: [down] });
    expect(steps(await run())).to.deep.equal(['baseline:false']);
    expect(scenario.break).not.toHaveBeenCalled();
  });

  it('restores the subject itself when the fault could not be arranged or never showed', async () => {
    const unarranged = rehearsalFactory({ probes: [up], broken: { ok: false, error: 'no route' } });
    expect(steps(await unarranged.run())).to.deep.equal(['baseline:true', 'arrange:false']);
    expect(unarranged.scenario.restore).toHaveBeenCalledOnce();
    vi.restoreAllMocks();

    const undetected = rehearsalFactory({ probes: [up, down] });
    expect(steps(await undetected.run())).to.deep.equal(['baseline:true', 'arrange:true', 'detect:false']);
    expect(undetected.scenario.restore).toHaveBeenCalledOnce();
  });

  it('reports a remediation that never recovered the subject and a dispatch that sent no mail', async () => {
    const { scenario, run } = rehearsalFactory({ probes: [up, up, down], mail: false });
    expect(steps(await run())).to.deep.equal([
      'baseline:true',
      'arrange:true',
      'detect:true',
      'act:true',
      'recover:false',
      'notify:false',
    ]);
    expect(scenario.restore).toHaveBeenCalledOnce();
  });
});

describe('event rehearsal of an event', () => {
  afterEach(() => vi.restoreAllMocks());

  const scenarioFactory = (subjects) => ({
    description: 'stops the hub tunnel',
    subjects: async () => subjects,
    break: async () => ({ ok: true }),
    restore: async () => ({ ok: true }),
  });

  beforeEach(() => {
    vi.spyOn(Underpost.event, 'assertDispatchReady').mockImplementation((definitions) => definitions);
    vi.spyOn(Underpost.event, 'definitions').mockReturnValue([{ id: EVENT_ID }]);
    vi.spyOn(Underpost.event, 'controlTarget').mockReturnValue({ user: 'root', host: 'control', via: 'local' });
  });

  it('rehearses every subject in turn and passes only when every step did', async () => {
    vi.spyOn(Underpost.event, 'e2eScenario').mockResolvedValue(scenarioFactory([{ label: 'a' }, { label: 'b' }]));
    const subject = vi
      .spyOn(Underpost.event, 'e2eSubject')
      .mockImplementation(async ({ subject: { label } }) => [{ name: 'recover', subject: label, ok: label === 'a' }]);
    const result = await event().e2e(EVENT_ID, { namespace: 'ns' });
    expect(result.ok).to.equal(false);
    expect(result.steps.map(({ subject: label }) => label)).to.deep.equal(['a', 'b']);
    expect(subject.mock.calls[0][0].context).to.deep.include({ eventId: EVENT_ID, namespace: 'ns' });
  });

  it('refuses an event with no subject to rehearse', async () => {
    vi.spyOn(Underpost.event, 'e2eScenario').mockResolvedValue(scenarioFactory([]));
    const error = await event()
      .e2e(EVENT_ID, {})
      .catch((caught) => caught);
    expect(error.message).to.include(`'${EVENT_ID}' has no subject to rehearse`);
  });
});

describe('event notification rendering', () => {
  it('lists every remediated subject, its health, the alert instances and the error', () => {
    const { subject, text } = event().notificationFactory({
      eventId: EVENT_ID,
      result: {
        ok: false,
        role: 'hub',
        condition: 'tunnel down',
        health: 'hub wg0 up',
        error: 'peer b unreachable',
        targets: [
          {
            role: 'spoke',
            spokeId: 'a',
            address: '10.0.0.2',
            via: 'ssh',
            commands: ['wg-quick up wg0'],
            ok: true,
            health: 'ok',
          },
          { role: 'spoke', spokeId: 'b', via: 'ssh', commands: [], ok: false, output: 'timeout' },
        ],
      },
      alerts: [{ labels: { instance: '10.0.0.2' } }, { labels: {} }],
    });
    expect(subject).to.equal(`[underpost] ${EVENT_ID} — a, b — FAILED`);
    for (const line of [
      'subjects:     a, b',
      'result:       FAILED',
      'alert instances: 10.0.0.2, ',
      '--- spoke a ---',
      'tunnel address:  10.0.0.2',
      'commands:        wg-quick up wg0',
      'health:\nok',
      'tunnel address:  (unresolved)',
      'commands:        (none)',
      'outcome:         failed',
      '--- hub health ---\nhub wg0 up',
      'error: peer b unreachable',
    ])
      expect(text, line).to.include(line);
  });

  it('names the role when no subject was resolved, and an unknown result', () => {
    expect(event().notificationFactory({ eventId: EVENT_ID, result: { ok: true, role: 'hub' } }).subject).to.equal(
      `[underpost] ${EVENT_ID} — hub — remediated`,
    );
    expect(event().notificationFactory({ eventId: EVENT_ID }).text).to.include('role:         unknown');
  });
});

describe('event dispatcher service state', () => {
  afterEach(() => vi.restoreAllMocks());

  const unit = (active) => {
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 6000));
    vi.spyOn(shell, 'exec').mockImplementation((command) => ({
      code: 0,
      stdout: command.includes('is-enabled') ? 'enabled\n' : `${active}\n`,
      stderr: '',
    }));
  };

  it('reports a unit that stays active for a restart interval as settled', () => {
    unit('active');
    expect(event().serviceState()).to.deep.include({ active: 'active', enabled: 'enabled', settled: true });
  });

  it('reports a unit that never becomes active as unsettled', () => {
    unit('failed');
    expect(event().serviceState({ timeoutMs: 1000 })).to.deep.include({ active: 'failed', settled: false });
  });
});
