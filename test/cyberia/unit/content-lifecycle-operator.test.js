import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../../../deploy/dd-cyberia/content-lifecycle.sh', import.meta.url).pathname;
const terminalRecorder = fs.existsSync('/usr/bin/script');
const ENV_PATH = '--env-path ./engine-private/conf/dd-cyberia/.env.production';

const libraries = {
  'github-actions-logging.sh': `RUN_QUIET_NODE_TAG=" [test]"
deploy_start() { echo "start: $1"; }
deploy_step() { echo "step: $1"; shift; "$@"; }
`,
  // A real sudo that slips through cannot reach a checkout.
  'host.sh': 'ENGINE_ROOT=/nonexistent-engine\n',
};

// Records each command line and answers with the first response whose pattern it contains.
const fakeSudo = `const fs = require('node:fs');
const command = process.argv.at(-1);
fs.appendFileSync(process.env.SUDO_LOG, command + '\\n');
const found = JSON.parse(process.env.SUDO_RESPONSES).find(([pattern]) => command.includes(pattern));
if (found) process.stdout.write(found[1]);
process.exitCode = found?.[2] ?? 0;
`;

// The output of a lifecycle command: its JSON document between log lines.
const printed = (document) =>
  `[cyberia.js] info forward open\n${JSON.stringify(document, null, 2)}\n[cyberia.js] info closed\n`;

const listing = (page, totalPages, cycles) => [
  `lifecycle list --limit 50 --page ${page} `,
  printed({ data: cycles.map(([cycleId, status]) => ({ cycleId, status })), total: cycles.length, page, totalPages }),
];
const plan = (status, next) => [
  'lifecycle plan',
  printed({ cycleId: 'dd-cyberia-1', status, next: next && { id: next } }),
];
const STARTED = [
  'lifecycle start',
  printed({ cycleId: 'dd-cyberia-new', status: 'in-progress', next: { id: 'preflight' } }),
];

let root;
let log;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-lifecycle-operator-'));
  fs.mkdirSync(path.join(root, 'lib'));
  fs.mkdirSync(path.join(root, 'dd-cyberia'));
  fs.mkdirSync(path.join(root, 'bin'));
  for (const [name, source] of Object.entries(libraries)) fs.writeFileSync(path.join(root, 'lib', name), source);
  fs.copyFileSync(script, path.join(root, 'dd-cyberia/content-lifecycle.sh'));
  fs.writeFileSync(path.join(root, 'fake-sudo.cjs'), fakeSudo);
  fs.writeFileSync(path.join(root, 'bin/sudo'), `#!/bin/bash\nexec node ${root}/fake-sudo.cjs "$@"\n`, { mode: 0o755 });
  log = path.join(root, 'sudo.log');
  fs.writeFileSync(log, '');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const environment = (responses, env) => ({
  PATH: `${root}/bin:${process.env.PATH}`,
  SUDO_LOG: log,
  SUDO_RESPONSES: JSON.stringify(responses),
  ...env,
});

// Detached: a new session without a terminal, as in CI or over a captured SSH run.
const run = (args, responses = [], env = {}) =>
  spawnSync('bash', [path.join(root, 'dd-cyberia/content-lifecycle.sh'), ...args], {
    encoding: 'utf8',
    detached: true,
    env: environment(responses, env),
  });

const commands = () =>
  fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^cd \/nonexistent-engine && /, ''));

const STAGES = [
  `node bin/cyberia content lifecycle doctor dd-cyberia-new ${ENV_PATH}`,
  'node bin db dd-cyberia --kubeadm --export --prune',
  'node bin db dd-cyberia --kubeadm --verify --restore-test',
  `node bin/cyberia content lifecycle verify infrastructure-backup --cycle dd-cyberia-new ${ENV_PATH}`,
  `node bin/cyberia content baseline capture --cycle dd-cyberia-new ${ENV_PATH}`,
  `node bin/cyberia content baseline verify --cycle dd-cyberia-new ${ENV_PATH}`,
];

describe('deploy/dd-cyberia/content-lifecycle.sh', () => {
  it.each([[[]], [['resume']], [['start', 'dd-cyberia-1']], [['status']]])('prints the usage for %j', (args) => {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
    expect(commands()).toEqual([]);
  });

  it('cancels every open cycle, prunes, starts a cycle and runs the control node stages in order', () => {
    const result = run(
      ['start'],
      [
        listing(1, 2, [
          ['dd-cyberia-a', 'in-progress'],
          ['dd-cyberia-b', 'completed'],
        ]),
        listing(2, 2, [
          ['dd-cyberia-c', 'failed'],
          ['dd-cyberia-d', 'cancelled'],
        ]),
        STARTED,
      ],
      { CYCLE_INSTANCES: 'test,amethyst-strata-expansion' },
    );
    expect(result.status).toBe(0);
    const reason = 'replaced\\ by\\ a\\ new\\ cycle\\ of\\ deploy/dd-cyberia/content-lifecycle.sh';
    expect(commands()).toEqual([
      `node bin/cyberia content lifecycle list --limit 50 --page 1 ${ENV_PATH}`,
      `node bin/cyberia content lifecycle list --limit 50 --page 2 ${ENV_PATH}`,
      `node bin/cyberia content lifecycle cancel dd-cyberia-a --reason ${reason} ${ENV_PATH}`,
      `node bin/cyberia content lifecycle cancel dd-cyberia-c --reason ${reason} ${ENV_PATH}`,
      `node bin/cyberia content baseline prune ${ENV_PATH}`,
      `node bin/cyberia content lifecycle start --instance test\\,amethyst-strata-expansion ${ENV_PATH}`,
      ...STAGES,
      `node bin/cyberia content lifecycle handoff dd-cyberia-new ${ENV_PATH}`,
    ]);
    expect(result.stdout).toContain('cancelled=2');
    expect(result.stdout).toContain('cycle=dd-cyberia-new');
    expect(result.stdout).toContain('WORKSTATION_PEER_ID=<peer-id>');
  });

  it('starts a cycle when no cycle is open', () => {
    const result = run(['start'], [listing(1, 0, []), STARTED]);
    expect(result.status).toBe(0);
    expect(commands().filter((command) => command.includes('lifecycle list'))).toHaveLength(1);
    expect(commands()).toContain(`node bin/cyberia content lifecycle start ${ENV_PATH}`);
    expect(result.stdout).toContain('cancelled=0');
  });

  it('resumes from the first stage that is not complete', () => {
    const result = run(['resume', 'dd-cyberia-1'], [plan('failed', 'baseline-capture')]);
    expect(result.status).toBe(0);
    expect(commands()).toEqual([
      `node bin/cyberia content lifecycle plan dd-cyberia-1 ${ENV_PATH}`,
      `node bin/cyberia content baseline capture --cycle dd-cyberia-1 ${ENV_PATH}`,
      `node bin/cyberia content baseline verify --cycle dd-cyberia-1 ${ENV_PATH}`,
      `node bin/cyberia content lifecycle handoff dd-cyberia-1 ${ENV_PATH}`,
    ]);
    expect(result.stdout).toContain('preflight: complete');
    expect(result.stdout).toContain('infrastructure-backup: complete');
  });

  it('runs no stage when the control node stages are complete', () => {
    const result = run(['resume', 'dd-cyberia-1'], [plan('in-progress', 'baseline-restore')]);
    expect(result.status).toBe(0);
    expect(commands()).toEqual([
      `node bin/cyberia content lifecycle plan dd-cyberia-1 ${ENV_PATH}`,
      `node bin/cyberia content lifecycle handoff dd-cyberia-1 ${ENV_PATH}`,
    ]);
  });

  it.each(['cancelled', 'completed', 'superseded'])('refuses to resume a %s cycle', (status) => {
    const result = run(['resume', 'dd-cyberia-1'], [plan(status, null)]);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain(`Cycle dd-cyberia-1 is ${status}`);
    expect(commands()).toHaveLength(1);
  });

  it('stops at a failed stage and names the command that resumes the cycle', () => {
    const result = run(['start'], [listing(1, 0, []), STARTED, ['baseline capture', 'capture failed\n', 1]]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('resume it with');
    expect(result.stderr).toContain('resume dd-cyberia-new');
    expect(commands().some((command) => command.includes('baseline verify'))).toBe(false);
  });

  it('stops before any cycle when a listing fails', () => {
    const result = run(['start'], [['lifecycle list', 'No MongoDB primary answers\n', 3]]);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('No MongoDB primary answers');
    expect(commands()).toHaveLength(1);
  });

  it('refuses a share without a terminal before any stage runs', () => {
    const result = run(['start'], [], { WORKSTATION_PEER_ID: 'asus-a15' });
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('WORKSTATION_PEER_ID needs a terminal');
    expect(commands()).toEqual([]);
  });

  it.skipIf(!terminalRecorder)('opens the share and prints its value to the terminal only', () => {
    const captured = path.join(root, 'captured.log');
    const responses = [
      plan('in-progress', 'baseline-restore'),
      ['lifecycle share', 'export CYBERIA_LIFECYCLE_SHARE=https://token@10.0.0.1:7735\n'],
    ];
    const result = spawnSync(
      'script',
      ['-qec', `bash ${root}/dd-cyberia/content-lifecycle.sh resume dd-cyberia-1 >${captured} 2>&1`, '/dev/null'],
      {
        encoding: 'utf8',
        env: { ...environment(responses, { WORKSTATION_PEER_ID: 'asus-a15', SHARE_HOURS: '4' }), SHELL: '/bin/bash' },
      },
    );
    expect(result.status).toBe(0);
    expect(commands().at(-1)).toBe(
      `node bin/cyberia content lifecycle share dd-cyberia-1 --peer-id asus-a15 --hours 4 ${ENV_PATH}`,
    );
    expect(result.stdout).toContain('export CYBERIA_LIFECYCLE_SHARE=');
    const output = fs.readFileSync(captured, 'utf8');
    expect(output).toContain('Share dd-cyberia-1 with asus-a15 until Ctrl+C');
    expect(output).not.toContain('CYBERIA_LIFECYCLE_SHARE');
  });
});
