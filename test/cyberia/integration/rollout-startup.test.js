import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SOURCE = readFileSync(new URL('../../../deploy/dd-cyberia/sync-deploy.sh', import.meta.url), 'utf8');
const BUNDLE = `v3-5-0-abc1234-deadbeef/client-20261030151234567-4242@sha256:${'a'.repeat(64)}`;
const stage = (name) => SOURCE.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))[0];

describe('engine rollout startup', () => {
  it.each([
    { bundleMode: 0, env: 'development' },
    { bundleMode: 1, env: 'production' },
  ])('loads deployment configuration before startup with bundle mode $bundleMode', ({ bundleMode, env }) => {
    const rendered = spawnSync(
      'bash',
      [
        '-c',
        `set -eu
      DEPLOY_ID=dd-cyberia DEPLOY_ENV=${env} BUNDLE_MODE=${bundleMode} CLIENT_BUNDLE=${BUNDLE} ENGINE_REVISION=rev
      ENGINE_SRC_REPO=example/engine POD_SRC_PRIVATE_REPO=example/config POD_SRC_PRIVATE_DIR=config
      ENGINE_ROOT=/engine ROUTING_FLAGS="--replicas 2" DEPLOY_IMAGE=engine@sha256:abc
      TARGET_NODE= INGRESS_NODE=ingress DEPLOY_SSH_KEY_PATH=key
      pod_bootstrap_cmd() { printf 'bootstrap %s' "$4"; }
      deploy_step() { shift; "$@"; }
      sudo() { printf '%s' "\${@: -1}"; }
      ${stage('stage_rollout')}
      stage_rollout`,
      ],
      { encoding: 'utf8' },
    );
    expect(rendered.status).toBe(0);
    expect(rendered.stdout.includes('--skip-full-build')).toBe(bundleMode === 1);
    const command = rendered.stdout.match(/--cmd '([\s\S]*?)'/)[1];
    const steps = command.split(',').map((step) => step.trim());
    expect(steps).toEqual([
      'bootstrap rev',
      'underpost clone example/config',
      'sudo rm -rf ./engine-private',
      'sudo mv ./config ./engine-private',
      `underpost app load --env ${env} --args deploy-id=dd-cyberia`,
      `underpost start dd-cyberia ${env} --build --run --skip-pull-repo-base --skip-pull-private-repo` +
        (bundleMode ? ` --bundle ${BUNDLE}` : ''),
    ]);
    for (const configStatus of [0, 23]) {
      const execution = spawnSync(
        'bash',
        [
          '-c',
          `
        bootstrap() { return 0; }
        sudo() { return 0; }
        underpost() {
          printf 'underpost:%s\n' "$*"
          if [ "$1" = app ]; then return ${configStatus}; fi
        }
        ${steps.join(' && ')}
      `,
        ],
        { encoding: 'utf8' },
      );
      expect(execution.status).toBe(configStatus);
      expect(execution.stdout.includes('underpost:start')).toBe(configStatus === 0);
    }
  });

  it.each([
    { env: 'production', bundleMode: 0, status: 1 },
    { env: 'production', bundleMode: 1, status: 0 },
    { env: 'development', bundleMode: 0, status: 0 },
  ])('a $env deploy with bundle mode $bundleMode exits $status', ({ env, bundleMode, status }) => {
    const checked = spawnSync(
      'bash',
      ['-c', `DEPLOY_ENV=${env} BUNDLE_MODE=${bundleMode}; ${stage('require_bundle_mode')}; require_bundle_mode`],
      { encoding: 'utf8' },
    );
    expect(checked.status).toBe(status);
    if (status) expect(checked.stderr).toMatch(/a production pod never builds the client/);
  });
});
