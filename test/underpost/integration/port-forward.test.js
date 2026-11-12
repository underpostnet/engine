// Needs only Node and a POSIX shell: stand-ins for sudo and kubectl on PATH replace the real ones.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Underpost from '../../../src/index.js';
import { alive } from '../../support/process.js';

const ENTRY = fileURLToPath(new URL('../../../src/index.js', import.meta.url));

// Like sudo, it survives a SIGTERM from its own process group and returns when its command ends.
const SUDO = `#!/bin/sh
trap : TERM
exec 3<&0
"$@" <&3 3<&- &
c=$!
while kill -0 "$c" 2>/dev/null; do wait "$c"; done
`;

const KUBECTL = `#!/bin/sh
echo $$ >> "$FORWARD_PIDS"
if [ -n "$FORWARD_REFUSE" ]; then echo 'pods "gone" not found' >&2; exit 1; fi
echo "Forwarding from 127.0.0.1 -> 27017"
exec sleep 600
`;

const until = async (condition, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
};

let scratch;
let saved;
const forwards = () =>
  fs.existsSync(process.env.FORWARD_PIDS)
    ? fs.readFileSync(process.env.FORWARD_PIDS, 'utf8').trim().split('\n').filter(Boolean).map(Number)
    : [];

beforeAll(() => {
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-forward-'));
  fs.mkdirSync(nodePath.join(scratch, 'bin'));
  fs.writeFileSync(nodePath.join(scratch, 'bin', 'sudo'), SUDO, { mode: 0o755 });
  fs.writeFileSync(nodePath.join(scratch, 'bin', 'kubectl'), KUBECTL, { mode: 0o755 });
  saved = { PATH: process.env.PATH, FORWARD_PIDS: process.env.FORWARD_PIDS };
  process.env.PATH = `${nodePath.join(scratch, 'bin')}:${process.env.PATH}`;
  process.env.FORWARD_PIDS = nodePath.join(scratch, 'pids');
});

afterEach(() => {
  for (const pid of forwards()) if (alive(pid)) process.kill(pid, 'SIGKILL');
  fs.removeSync(process.env.FORWARD_PIDS);
  delete process.env.FORWARD_REFUSE;
});

afterAll(() => {
  Object.assign(process.env, saved);
  fs.removeSync(scratch);
});

describe('the lifetime of a forward to a pod', () => {
  it('stops kubectl when its owner closes the forward', async () => {
    const { close, ended } = await Underpost.kubectl.portForward({ resource: 'pod/mongodb-0', remotePort: 27017 });
    const [pid] = forwards();
    expect(alive(pid)).toBe(true);
    close();
    await ended;
    expect(alive(pid)).toBe(false);
  });

  it('stops kubectl when its owner dies without a close', async () => {
    const owner = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { default: Underpost } = await import(${JSON.stringify(ENTRY)});
await Underpost.kubectl.portForward({ resource: 'pod/mongodb-0', remotePort: 27017 });
process.kill(process.pid, 'SIGKILL');`,
      ],
      { stdio: 'ignore' },
    );
    const [, signal] = await new Promise((resolve) => owner.on('exit', (...outcome) => resolve(outcome)));
    expect(signal).toBe('SIGKILL');
    const [pid] = forwards();
    expect(pid).toBeGreaterThan(0);
    await until(() => !alive(pid));
    expect(alive(pid)).toBe(false);
  });

  it('fails at once with the error of kubectl when kubectl exits', async () => {
    process.env.FORWARD_REFUSE = '1';
    const startedAt = Date.now();
    await expect(
      Underpost.kubectl.portForward({ resource: 'pod/gone', remotePort: 27017, readyTimeoutMs: 10000 }),
    ).rejects.toThrow(/pods "gone" not found/);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
