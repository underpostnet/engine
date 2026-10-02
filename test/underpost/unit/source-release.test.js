import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import Underpost from '../../../src/index.js';
import {
  RELEASE_PROFILES,
  SOURCE_CHANNELS,
  assertReleaseId,
  assertSourceChannel,
  assertSourceRevision,
} from '../../../src/server/release/source-release.js';
import { releaseJobManifestFactory, releaseJobName } from '../../../src/server/release/release-job.js';

const hostLib = new URL('../../../deploy/lib/host.sh', import.meta.url).pathname;

describe('source channels', () => {
  it('resolve a product repository to itself on public and to its private mirror on private', () => {
    expect(SOURCE_CHANNELS).toEqual(['public', 'private']);
    expect(Underpost.repo.sourceRepoFactory('underpostnet/cyberia-content')).toBe('underpostnet/cyberia-content');
    expect(Underpost.repo.sourceRepoFactory('underpostnet/cyberia-audio', 'private')).toBe(
      'underpostnet/cyberia-audio-private',
    );
  });

  it('refuse an unknown channel and a private mirror given as the public repository', () => {
    expect(() => Underpost.repo.sourceRepoFactory('underpostnet/cyberia-content', 'staging')).toThrow(
      /unknown source channel/,
    );
    expect(() => Underpost.repo.sourceRepoFactory('underpostnet/cyberia-content-private', 'private')).toThrow(
      /private mirror/,
    );
    expect(() => assertSourceChannel('test')).toThrow(/public or private/);
  });

  it('keep the engine on its own mirror pair, resolved without the CLI', () => {
    const engine = (channel) =>
      execFileSync('bash', ['-c', `source "${hostLib}"; engine_source_repo dd-cyberia ${channel}`], {
        encoding: 'utf8',
      });
    expect(engine('public')).toBe('underpostnet/engine-cyberia');
    expect(engine('private')).toBe('underpostnet/engine-test-cyberia');
    expect(() =>
      execFileSync('bash', ['-c', `source "${hostLib}"; engine_source_repo dd-cyberia staging`], { stdio: 'pipe' }),
    ).toThrow();
  });
});

describe('release identity', () => {
  it('takes only an exact source revision', () => {
    const revision = 'a'.repeat(40);
    expect(assertSourceRevision(` ${revision} `)).toBe(revision);
    for (const value of ['main', 'HEAD', 'a'.repeat(12), 'A'.repeat(40)])
      expect(() => assertSourceRevision(value)).toThrow(/exact 40-character/);
  });

  it('takes release ids that name a database and a Job', () => {
    expect(assertReleaseId(' v3-4-5-8b4d643-04f978b0 ')).toBe('v3-4-5-8b4d643-04f978b0');
    for (const id of ['', 'Upper', 'has space', 'v3.4.5', 'a'.repeat(49)]) expect(() => assertReleaseId(id)).toThrow();
  });

  it('names the four release profiles', () => {
    expect(Object.keys(RELEASE_PROFILES)).toEqual([
      'application-release',
      'data-release',
      'container-release',
      'source-sync',
    ]);
  });
});

describe('the Release Job', () => {
  const manifest = (params = {}) =>
    load(
      releaseJobManifestFactory({
        name: 'dd-x-release-v1-abc',
        image: 'engine:1',
        command: 'echo build',
        secretName: 'dd-x-production-data-release',
        variables: { NODE_ENV: 'production' },
        deployId: 'dd-x',
        releaseId: 'v1-abc',
        nodeName: 'node-1',
        storePath: '/store',
        ...params,
      }),
    );

  it('runs one command once, with one Secret, and reads the release store read only', () => {
    const job = manifest();
    expect(job.kind).toBe('Job');
    expect(job.spec.backoffLimit).toBe(0);
    const pod = job.spec.template.spec;
    expect(pod.restartPolicy).toBe('Never');
    expect(pod.nodeSelector).toEqual({ 'kubernetes.io/hostname': 'node-1' });
    expect(pod.initContainers).toBeUndefined();
    const [container] = pod.containers;
    expect(container.envFrom).toEqual([{ secretRef: { name: 'dd-x-production-data-release' } }]);
    expect(container.env).toEqual([
      { name: 'NODE_ENV', value: 'production' },
      { name: 'UNDERPOST_RELEASE_STORE', value: '/store' },
    ]);
    expect(container.command).toEqual(['/bin/sh', '-c', 'echo build']);
    expect(container.volumeMounts).toEqual([{ name: 'release-store', mountPath: '/store', readOnly: true }]);
    expect(pod.volumes[0].hostPath).toEqual({ path: '/store', type: 'Directory' });
  });

  it('carries any command line whole, and refuses a Job without its Secret', () => {
    const command = `cd /x && rm -f .env && echo "a, b" && test "$(id -u)" = '0'`;
    expect(manifest({ command }).spec.template.spec.containers[0].command[2]).toBe(command);
    expect(() => manifest({ secretName: '' })).toThrow(/needs secretName/);
  });

  it('names each run of a release with a valid, unique Job name', () => {
    const long = releaseJobName({ deployId: 'dd-cyberia', releaseId: 'v3-4-5-8b4d643-04f978b0', now: 1 });
    expect(long.length).toBeLessThanOrEqual(63);
    expect(long).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    expect(releaseJobName({ deployId: 'dd-x', releaseId: 'r1', now: 1 })).not.toBe(
      releaseJobName({ deployId: 'dd-x', releaseId: 'r1', now: 2 }),
    );
  });
});
