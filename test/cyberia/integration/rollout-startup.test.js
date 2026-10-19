import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

describe('engine rollout startup', () => {
  it.each([0, 1])('loads deployment configuration before startup with bundle mode %i', (bundleMode) => {
    const source = readFileSync(new URL('../../../deploy/dd-cyberia/sync-deploy.sh', import.meta.url), 'utf8');
    const rollout = source.match(/^stage_rollout\(\) \{[\s\S]*?^\}/m)[0];
    const rendered = spawnSync(
      'bash',
      [
        '-c',
        `set -eu
      DEPLOY_ID=dd-cyberia DEPLOY_ENV=production BUNDLE_MODE=${bundleMode}
      ENGINE_SRC_REPO=example/engine POD_SRC_PRIVATE_REPO=example/config POD_SRC_PRIVATE_DIR=config
      ENGINE_ROOT=/engine ROUTING_FLAGS="--replicas 2" DEPLOY_IMAGE=engine:test
      TARGET_NODE= INGRESS_NODE=ingress DEPLOY_SSH_KEY_PATH=key
      pod_bootstrap_cmd() { printf bootstrap; }
      deploy_step() { shift; "$@"; }
      sudo() { printf '%s' "\${@: -1}"; }
      ${rollout}
      stage_rollout`,
      ],
      { encoding: 'utf8' },
    );
    expect(rendered.status).toBe(0);
    const command = rendered.stdout.match(/--cmd '([\s\S]*?)'/)[1];
    const steps = command.split(',').map((step) => step.trim());
    expect(steps).toEqual([
      'bootstrap',
      'underpost clone example/config',
      'sudo rm -rf ./engine-private',
      'sudo mv ./config ./engine-private',
      'underpost app load --env production --args deploy-id=dd-cyberia',
      'underpost start dd-cyberia production --build --run --skip-pull-repo-base --skip-pull-private-repo' +
        (bundleMode ? ' --pull-bundle' : ''),
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
});
