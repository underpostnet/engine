'use strict';

// Needs only Node. The abstract socket and process identity cases need Linux.

import { expect } from 'chai';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { acquireHostLock, hostLockHolders, hostLockName } from '../../../src/server/runtime/host-lock.js';
import { bootId, processStartTicks } from '../../../src/server/runtime/linux-resources.js';
import { alive } from '../../support/process.js';

const engineRoot = process.cwd();
const linux = fs.existsSync('/proc/self/stat');

const until = async (condition, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition()) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
};

describe('host lock', () => {
  let directory;
  const lock = (options) => acquireHostLock({ name: 'fixture', directory, pollMs: 50, ...options });
  const records = () => fs.readdirSync(directory).filter((entry) => entry.endsWith('.json'));

  // A process that takes the lock, starts a workload in its own process group when asked, and waits.
  const holder = ({ workload = false } = {}) => {
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { acquireHostLock } = await import(${JSON.stringify(`${engineRoot}/src/server/runtime/host-lock.js`)});
         const held = await acquireHostLock({ name: 'fixture', directory: ${JSON.stringify(directory)} });
         let group = 0;
         if (${workload}) {
           const started = (await import('node:child_process')).spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
           started.unref();
           held.attach(started.pid);
           group = started.pid;
         }
         console.log(JSON.stringify({ group }));
         setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    const ready = new Promise((resolve) => child.stdout.once('data', (data) => resolve(JSON.parse(`${data}`))));
    return { child, ready };
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-locks-'));
  });

  afterEach(() => {
    fs.removeSync(directory);
  });

  it('names one lock per target, however its path is spelled or linked', () => {
    expect(hostLockName('client', './public/a')).to.equal(hostLockName('client', `${process.cwd()}/public/a/`));
    expect(hostLockName('client', './public/a')).to.match(/^client-[0-9a-f]{16}$/);
    expect(hostLockName('client', './public/a')).not.to.equal(hostLockName('client', './public/b'));
    fs.mkdirSync(nodePath.join(directory, 'real'));
    fs.symlinkSync(nodePath.join(directory, 'real'), nodePath.join(directory, 'link'));
    expect(hostLockName('client', nodePath.join(directory, 'link', 'site'))).to.equal(
      hostLockName('client', nodePath.join(directory, 'real', 'site')),
    );
  });

  it('lets as many holders in as it has slots, and the next one waits until a slot frees', async () => {
    const first = await lock({ slots: 2 });
    const second = await lock({ slots: 2 });
    const waits = [];
    expect(await lock({ slots: 2, timeoutMs: 200, onWait: (holders) => waits.push(holders) })).to.equal(null);
    expect(waits).to.have.length(1);
    expect(waits[0].map(({ pid, holderAlive }) => [pid, holderAlive])).to.deep.equal([
      [process.pid, true],
      [process.pid, true],
    ]);
    const third = lock({ slots: 2, timeoutMs: 5000 });
    second.release();
    second.release();
    expect(await third).not.to.equal(null);
    first.release();
  });

  it('ends a wait on abort', async () => {
    const held = await lock();
    const abort = new AbortController();
    const waiting = lock({ signal: abort.signal });
    setTimeout(() => abort.abort('SIGINT'), 100);
    expect(await waiting).to.equal(null);
    held.release();
    expect(records()).to.deep.equal([]);
  });

  it('frees the slot of a holder that is killed, and drops its record', async () => {
    const killed = holder();
    await killed.ready;
    expect(hostLockHolders('fixture', 1, directory).map(({ pid }) => pid)).to.deep.equal([killed.child.pid]);
    expect(await lock({ timeoutMs: 300 })).to.equal(null);
    killed.child.kill('SIGKILL');
    await until(() => killed.child.exitCode !== null || killed.child.signalCode !== null);
    const held = await lock({ timeoutMs: 1000 });
    expect(held).not.to.equal(null);
    expect(records()).to.have.length(1);
    held.release();
    expect(records()).to.deep.equal([]);
  });

  it.skipIf(!linux)('ignores a record whose pid names another process, or that an earlier boot wrote', async () => {
    const own = { pid: process.pid, startTicks: processStartTicks(process.pid), bootId: bootId(), command: 'old' };
    fs.writeJsonSync(nodePath.join(directory, 'fixture.0.reused.json'), { ...own, startTicks: own.startTicks + 1 });
    fs.writeJsonSync(nodePath.join(directory, 'fixture.0.reboot.json'), { ...own, bootId: 'an-earlier-boot' });
    fs.outputFileSync(nodePath.join(directory, 'fixture.0.torn.json'), '{"pid": 12');
    // A lock no process takes again: its ended holder's record goes with the next acquisition of any lock.
    fs.writeJsonSync(nodePath.join(directory, 'other.0.ended.json'), { ...own, startTicks: own.startTicks + 1 });
    fs.writeJsonSync(nodePath.join(directory, 'other.1.live.json'), own);
    expect(hostLockHolders('fixture', 1, directory)).to.deep.equal([]);
    const held = await lock({ timeoutMs: 1000 });
    expect(held).not.to.equal(null);
    expect(
      records()
        .filter((entry) => !entry.startsWith('fixture.'))
        .sort(),
    ).to.deep.equal(['other.1.live.json']);
    expect(records().filter((entry) => entry.startsWith('fixture.'))).to.have.length(1);
    held.release();
  });

  it.skipIf(!linux)(
    'keeps the slot while the workload of a holder that ended still runs',
    async () => {
      const supervisor = holder({ workload: true });
      const { group } = await supervisor.ready;
      supervisor.child.kill('SIGKILL');
      await until(() => supervisor.child.exitCode !== null || supervisor.child.signalCode !== null);
      expect(alive(group)).to.equal(true);

      const waits = [];
      expect(await lock({ timeoutMs: 400, onWait: (holders) => waits.push(holders) })).to.equal(null);
      expect(waits[0]).to.have.length(1);
      expect(waits[0][0]).to.include({ pid: supervisor.child.pid, holderAlive: false });
      expect(waits[0][0].workload.pgid).to.equal(group);

      process.kill(-group, 'SIGKILL');
      await until(() => !alive(group));
      const held = await lock({ timeoutMs: 2000 });
      expect(held).not.to.equal(null);
      held.release();
    },
    20000,
  );

  it('lets one of many processes that start at once hold a slot at a time', async () => {
    const startAt = Date.now() + 1500;
    const contenders = Array.from(
      { length: 12 },
      () =>
        new Promise((resolve) => {
          const child = spawn(
            process.execPath,
            [
              '--input-type=module',
              '-e',
              `const { acquireHostLock } = await import(${JSON.stringify(`${engineRoot}/src/server/runtime/host-lock.js`)});
               while (Date.now() < ${startAt}) {}
               const held = await acquireHostLock({ name: 'fixture', directory: ${JSON.stringify(directory)}, pollMs: 2 });
               const from = process.hrtime.bigint();
               await new Promise((resolve) => setTimeout(resolve, 40));
               const to = process.hrtime.bigint();
               held.release();
               console.log(JSON.stringify([String(from), String(to)]));`,
            ],
            { stdio: ['ignore', 'pipe', 'inherit'] },
          );
          let out = '';
          child.stdout.on('data', (data) => (out += data));
          child.once('exit', () => resolve(JSON.parse(out).map(BigInt)));
        }),
    );
    const holds = (await Promise.all(contenders)).sort(([a], [b]) => (a < b ? -1 : 1));
    for (let index = 1; index < holds.length; index++) expect(holds[index][0] > holds[index - 1][1]).to.equal(true);
    expect(records()).to.deep.equal([]);
  }, 30000);
});
