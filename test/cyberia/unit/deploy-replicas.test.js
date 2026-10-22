import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const deployRoot = new URL('../../../deploy/', import.meta.url).pathname;

// A step prints the host command it would run; every other library function does nothing.
const libraryStub = `ENGINE_ROOT=/engine HOST_NODE=host WORKER_NODE=worker INGRESS_NODE=ingress DEPLOY_SSH_KEY_PATH=key CYBERIA_API_ORIGIN=https://api
deploy_step() { shift; "$@"; }
sudo() { printf '%s\\n' "\${@: -1}"; }
command_not_found_handle() { return 0; }
`;

/** Runs a deploy script on the stub libraries, with `entry` in place of `main`, and returns its output. */
const run = (script, env, entry = 'main') => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-replicas-'));
  try {
    fs.mkdirSync(path.join(root, 'lib'));
    for (const library of ['github-actions-logging.sh', 'host.sh', 'release-sources.sh', 'content-release.sh'])
      fs.writeFileSync(path.join(root, 'lib', library), library === 'github-actions-logging.sh' ? libraryStub : '');
    const target = path.join(root, script);
    fs.mkdirSync(path.dirname(target));
    const source = fs.readFileSync(path.join(deployRoot, script), 'utf8');
    fs.writeFileSync(target, source.replace(/^main "\$@"$/m, entry));
    return spawnSync('bash', [target], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } }).stdout;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const runnerCommand = (output, runner) => output.split('\n').find((line) => line.includes(`node bin run ${runner} `));

describe('a Cyberia deploy renders the pod count REPLICAS sets', () => {
  it.each(['cyberia-server/deploy.sh', 'cyberia-client/deploy.sh'])('%s passes it to run instance', (script) => {
    expect(runnerCommand(run(script, { REPLICAS: '3' }), 'instance')).toMatch(/ --replicas 3 /);
    expect(runnerCommand(run(script, {}), 'instance')).toMatch(/ --replicas 1 /);
  });

  it('sync-deploy passes it to run sync and to the switch back', () => {
    const script = 'dd-cyberia/sync-deploy.sh';
    const env = { DEPLOY_IMAGE: 'engine:1' };
    expect(runnerCommand(run(script, { ...env, REPLICAS: '3' }, 'stage_rollout'), 'sync')).toMatch(/ --replicas 3 /);
    expect(runnerCommand(run(script, env, 'stage_rollout'), 'sync')).toMatch(/ --replicas 1 /);
    const revert = 'RELEASE_STATE=switched\nPREVIOUS_COLOUR=blue\ntrap revert_release EXIT\nfalse';
    expect(runnerCommand(run(script, { ...env, REPLICAS: '3' }, revert), 'promote')).toMatch(/ --replicas 3 /);
  });
});
