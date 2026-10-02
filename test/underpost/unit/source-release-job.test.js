import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = [];

vi.mock('../../../src/server/security/container-storage.js', () => ({
  default: {},
  ensureContainerStorage: (paths) => calls.push(`label ${paths}`),
}));
vi.mock('../../../src/server/release/release-workspace.js', async (importOriginal) => ({
  ...(await importOriginal()),
  stageReleaseEngine: ({ root }) => {
    calls.push(`stage ${root}`);
    return { revision: 'f'.repeat(40), dir: `${root}/.engine` };
  },
}));
vi.mock('../../../src/server/release/release-job.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runReleaseJob: async ({ name }) => {
    calls.push(`run ${name.replace(/-[a-z0-9]+$/, '')}`);
    return true;
  },
}));

const { default: UnderpostSourceRelease } = await import('../../../src/cli/source-release.js');

const job = (options = {}) =>
  UnderpostSourceRelease.API.job('r1', {
    deployId: 'dd-widget',
    image: 'engine:1',
    cmd: 'true',
    scope: 'data-release',
    store: '/srv/release-store',
    ...options,
  });

describe('a Release Job run', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('stages the deployed engine, labels the store for a container, then runs the Job', async () => {
    expect(await job()).toBe(true);
    expect(calls).toEqual(['stage /srv/release-store', 'label /srv/release-store', 'run dd-widget-release-r1']);
  });

  it('touches nothing on the host for a dry run', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await job({ dryRun: true })).toBe(true);
    expect(calls).toEqual([]);
  });
});
