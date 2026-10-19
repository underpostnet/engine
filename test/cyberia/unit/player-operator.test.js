import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const deployRoot = new URL('../../../deploy/', import.meta.url).pathname;

const libraries = {
  'github-actions-logging.sh': `deploy_start() { echo "start: $1"; }
deploy_step() { shift; "$@"; }
`,
  'host.sh': 'ENGINE_ROOT=/engine HOST_NODE=host\n',
  'content-release.sh': `live_image() { echo engine:1; }
apply_release_secret() { echo secret; return "\${SECRET_STATUS:-0}"; }
release_job() { echo "job: $1 | $2 | $3"; }
`,
};

const run = (args, env = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'player-operator-'));
  try {
    fs.mkdirSync(path.join(root, 'lib'));
    for (const [name, source] of Object.entries(libraries)) fs.writeFileSync(path.join(root, 'lib', name), source);
    fs.mkdirSync(path.join(root, 'dd-cyberia'));
    fs.copyFileSync(path.join(deployRoot, 'dd-cyberia/player.sh'), path.join(root, 'dd-cyberia/player.sh'));
    return spawnSync('bash', [path.join(root, 'dd-cyberia/player.sh'), ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe('deploy/dd-cyberia/player.sh', () => {
  it.each([[[]], [['player']], [['content-release', 'status']]])('prints the usage for %j', (args) => {
    const result = run(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage:');
    expect(result.stdout).not.toContain('job:');
  });

  it.each([
    ['held', '--universe', 'cyberia'],
    ['rebind-held', 'lamp', '--universe', 'cyberia', '--apply'],
  ])('runs player %s in a Release Job', (...args) => {
    const result = run(['player', ...args]);
    expect(result.status).toBe(0);
    expect(result.stdout.indexOf('secret')).toBeLessThan(result.stdout.indexOf('job:'));
    expect(result.stdout).toContain(`job: player-${args[0]} | engine:1 | node bin/cyberia player ${args.join(' ')}`);
  });

  it('stops before the Release Job when credential setup fails', () => {
    const result = run(['player', 'held'], { SECRET_STATUS: '23' });
    expect(result.status).toBe(23);
    expect(result.stdout).not.toContain('job:');
  });
});
