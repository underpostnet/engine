// The placement helpers of deploy/lib/host.sh drive the real shell functions. A stub `sudo` stands in
// for the CLI and for kubectl, so nothing runs on the host.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const hostLib = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../../deploy/lib/host.sh');
const PLACEMENT = "UNDERPOST_KUBECONFIG='/pin:/base' UNDERPOST_CONTEXT='prod' UNDERPOST_NAMESPACE_WORKLOADS='dd-apps'";

let scratch;
beforeEach(() => {
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-placement-'));
});
afterEach(() => fs.removeSync(scratch));

/** Runs a script after the library, with `sudo` printing `cli` for the CLI call and its arguments otherwise. */
const run = (script, cli = `echo 'log line'; echo "${PLACEMENT}"`) => {
  const calls = nodePath.join(scratch, 'calls');
  const sudo = `sudo() { printf '%s\\n' "$*" >> "${calls}"; case "$*" in *"namespace env"*) ${cli} ;; *) printf '%s\\n' "$@" ;; esac; }`;
  const result = spawnSync('bash', ['-c', `set -euo pipefail; ${sudo}; source "${hostLib}"; ${script}`], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ENGINE_SRC_REPO: 'o/engine',
      ENGINE_SRC_PRIVATE_REPO: 'o/engine-private',
      DEPLOY_ENV: 'test',
    },
  });
  return { ...result, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [] };
};

describe('the placement of a deploy script', () => {
  it('reads the last line the CLI prints for its environment, once', () => {
    const { stdout, calls, status } = run(
      'cluster_placement; cluster_placement; printf "%s|%s" "$UNDERPOST_KUBECONFIG" "$UNDERPOST_NAMESPACE_WORKLOADS"',
    );
    expect(status).toBe(0);
    expect(stdout).toBe('/pin:/base|dd-apps');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('node bin namespace env --env test');
  });

  it('stops when the CLI fails or prints no placement', () => {
    for (const cli of ['echo "UNDERPOST_KUBECONFIG=x"; return 3', "echo 'error: invalid conf.cluster.json'"]) {
      const { status, stdout } = run('cluster_placement; echo reached', cli);
      expect(status, cli).not.toBe(0);
      expect(stdout, cli).not.toContain('reached');
    }
  });

  it('runs kubectl as root in the pinned context, which sudo would drop', () => {
    const { stdout, status } = run('cluster_placement; cluster_kubectl get pods -n "$UNDERPOST_NAMESPACE_WORKLOADS"');
    expect(status).toBe(0);
    expect(stdout.trim().split('\n')).toEqual([
      '-n',
      '--',
      'env',
      'KUBECONFIG=/pin:/base',
      'kubectl',
      'get',
      'pods',
      '-n',
      'dd-apps',
    ]);
  });
});
