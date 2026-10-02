import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import Underpost from '../../../src/index.js';

vi.mock(import('../../../src/projects/cyberia/content-artifact.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  openContentArtifact: vi.fn(),
}));

const { openContentArtifact } = await import('../../../src/projects/cyberia/content-artifact.js');
const { STACK_IMAGES } = await import('../../../src/projects/cyberia/compose-stack.js');
const { RELEASE_CONTENT } = await import('../../../src/projects/cyberia/release-content.js');
const {
  STACK_BUILDER_STAGE,
  STACK_IMAGE_IDS,
  assertStackImages,
  assertStackSource,
  engineCloneArgs,
  localImage,
  localImageEnv,
  stackProbes,
  stageLocalEngineSource,
} = await import('../../../src/projects/cyberia/local-stack.js');

const hostLib = new URL('../../../deploy/lib/host.sh', import.meta.url).pathname;

const scratch = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
};

/** A git working tree with one tracked, one untracked, one ignored and one deleted tracked file. */
const workingTree = (name) => {
  const root = tempDir(`local-stack-${name}-`);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  git('init', '-q');
  fs.outputFileSync(path.join(root, '.gitignore'), 'ignored.txt\n');
  fs.outputFileSync(path.join(root, 'tracked/file.txt'), `${name} tracked`);
  fs.outputFileSync(path.join(root, 'deleted.txt'), 'gone');
  git('add', '.');
  fs.removeSync(path.join(root, 'deleted.txt'));
  fs.outputFileSync(path.join(root, 'untracked.txt'), `${name} untracked`);
  fs.outputFileSync(path.join(root, 'ignored.txt'), 'private');
  return root;
};

afterEach(() => {
  for (const dir of scratch.splice(0)) fs.removeSync(dir);
  vi.mocked(openContentArtifact).mockReset();
});

describe('the local stack', () => {
  it('takes a local or a clone source', () => {
    expect(assertStackSource('local')).toBe('local');
    expect(assertStackSource('clone')).toBe('clone');
    expect(() => assertStackSource('remote')).toThrow('--source is local or clone, not "remote"');
  });

  it('builds every stack image unless some are named', () => {
    expect(assertStackImages([])).toEqual(['engine-cyberia', 'cyberia-server', 'cyberia-client']);
    expect(assertStackImages(['cyberia-client'])).toEqual(['cyberia-client']);
    expect(() => assertStackImages(['cyberia-portal'])).toThrow('cyberia-portal: not a stack image');
  });

  it('runs compose on the image each build names', () => {
    const env = localImageEnv();
    expect(Object.keys(env)).toHaveLength(2 * STACK_IMAGE_IDS.length);
    for (const [id, prefix] of Object.entries(STACK_IMAGES)) {
      const { name, repository, tag } = localImage(id);
      // Podman stores a local build as `localhost/<name>`, which is what Docker loads.
      expect(`localhost/${name}`).toBe(`${repository}:${tag}`);
      expect(env[`${prefix}_IMAGE`]).toBe(repository);
      expect(env[`${prefix}_TAG`]).toBe(Underpost.version);
    }
  });

  it('keeps one builder cache tag for each image, whatever the version', () => {
    expect(STACK_BUILDER_STAGE).toBe('builder');
    for (const id of STACK_IMAGE_IDS) expect(localImage(id).builder).toBe(`${id}-dev:builder`);
    for (const id of STACK_IMAGE_IDS) {
      const dockerfile = fs.readFileSync(`./src/runtime/${id}/Dockerfile.dev`, 'utf8');
      expect(dockerfile, id).toMatch(new RegExp(`^FROM \\S+ AS ${STACK_BUILDER_STAGE}$`, 'm'));
    }
  });

  it.each(['public', 'private'])('clones the %s channel from the repositories a deploy fetches', (channel) => {
    const args = engineCloneArgs({
      channel,
      deploymentRepository: 'underpostnet/cyberia-deployment',
      contentRepository: 'underpostnet/cyberia-content',
    });
    const engine = execFileSync('bash', ['-c', `source "${hostLib}"; engine_source_repo dd-cyberia ${channel}`], {
      encoding: 'utf8',
    });
    const mirror = channel === 'private' ? '-private' : '';
    expect(args).toEqual({
      CYBERIA_SOURCE: 'clone',
      ENGINE_REPOSITORY: engine,
      DEPLOYMENT_REPOSITORY: `underpostnet/cyberia-deployment${mirror}`,
      CONTENT_REPOSITORY: `underpostnet/cyberia-content${mirror}`,
    });
  });

  it('probes the engine and each world through the gateway names', () => {
    const probes = stackProbes();
    expect(probes).toHaveLength(1 + 2 * RELEASE_CONTENT.instances.length);
    expect(probes[0].url).toBe('http://engine-cyberia/api/v1/cyberia-content-release/active');
    expect(probes.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        'http://cyberia-client/',
        'http://cyberia-server/api/v1/health/ready',
        'http://cyberia-client/test/',
        'http://cyberia-server/test/api/v1/health/ready',
      ]),
    );
  });

  it('stages the working trees and the content artifact of the workspace', () => {
    const context = tempDir('local-stack-context-');
    fs.outputFileSync(path.join(context, 'source/stale.txt'), 'old');
    const contentRoot = tempDir('local-stack-content-');
    fs.outputFileSync(path.join(contentRoot, 'dist/manifest.json'), '{}');
    fs.outputFileSync(path.join(contentRoot, 'src/authored.json'), '{}');

    const source = stageLocalEngineSource({
      context,
      engineRoot: workingTree('engine'),
      deploymentRoot: workingTree('deployment'),
      contentRoot,
    });

    expect(vi.mocked(openContentArtifact)).toHaveBeenCalledWith(contentRoot);
    expect(source).toBe(path.join(context, 'source'));
    const files = (dir) => fs.readdirSync(path.join(source, dir), { recursive: true }).sort();
    expect(files('engine')).toEqual(['.gitignore', 'tracked', 'tracked/file.txt', 'untracked.txt']);
    expect(fs.readFileSync(path.join(source, 'cyberia-deployment/untracked.txt'), 'utf8')).toBe('deployment untracked');
    expect(files('cyberia-content')).toEqual(['dist', 'dist/manifest.json']);
    expect(fs.existsSync(path.join(source, 'stale.txt'))).toBe(false);
  });

  it('stages nothing from a content artifact that does not open', () => {
    vi.mocked(openContentArtifact).mockImplementation(() => {
      throw new Error('No content artifact');
    });
    const context = tempDir('local-stack-context-');
    expect(() =>
      stageLocalEngineSource({ context, engineRoot: '.', deploymentRoot: '.', contentRoot: context }),
    ).toThrow('No content artifact');
    expect(fs.existsSync(path.join(context, 'source'))).toBe(false);
  });
});
