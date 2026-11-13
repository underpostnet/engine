import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';
import { writeProceduralArtifact } from '../../support/procedural-content.js';

// The public website build against a real content artifact on disk: the published worlds of the
// artifact reach the landing HTML, and a missing, altered or unlocked artifact stops the build.

vi.mock('../../../src/projects/cyberia/runtime/game-origins.js', () => ({
  gameOrigins: () => ({ portal: 'https://services.fixture.test' }),
}));

const { ssrData } = await import('../../../src/projects/cyberia/instance/public-worlds.js');
const { refreshWorkspaceArtifact } = await import('../../../src/projects/cyberia/content/content-artifact.js');
const { ssrFactory } = await import('../../../src/client-builder/ssr.js');

const sha256 = (data) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
const roots = [];
let thumbnail;
let revision = 0;

beforeAll(async () => {
  thumbnail = await sharp({ create: { width: 768, height: 512, channels: 4, background: '#0a1430' } })
    .png()
    .toBuffer();
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** A content artifact with the released worlds, each with its instance record and its files. */
const writeArtifact = (worlds) => {
  const root = writeProceduralArtifact();
  roots.push(root);
  const dist = path.join(root, 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  const write = (file, value) => {
    const data = Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    fs.writeFileSync(path.join(dist, file), data);
    manifest.files[file] = sha256(data);
  };
  for (const [code, { record, files = {} }] of Object.entries(worlds)) {
    write(`instances/${code}/cyberia-instance.json`, { code, ...record });
    for (const [name, file] of Object.entries(files)) write(`instances/${code}/files/${name}.json`, file);
  }
  manifest.instances = Object.keys(worlds);
  manifest.contentDigest = sha256(
    Object.keys(manifest.files)
      .sort()
      .map((file) => `${file} ${manifest.files[file]}\n`)
      .join(''),
  );
  fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest));
  const deployment = fs.mkdtempSync(path.join(os.tmpdir(), 'public-site-deployment-'));
  roots.push(deployment);
  vi.stubEnv('CYBERIA_CONTENT_ROOT', root);
  vi.stubEnv('CYBERIA_DEPLOYMENT_ROOT', deployment);
  return { root, manifest, deployment };
};

/** The released worlds; each call is a new revision, so each artifact has its own digest. */
const WORLDS = () => ({
  [DEFAULT_INSTANCE_CODE]: {
    record: {
      name: 'The Violet Strata',
      description: `A violet world, revision ${++revision}.`,
      status: 'published',
      thumbnail: 't1',
    },
    files: { shot: { _id: 't1', mimetype: 'image/png', data: { $base64: thumbnail.toString('base64') } } },
  },
  test: { record: { name: 'Hidden', description: 'Not public.', status: 'unlisted' } },
});

/** The landing page the build renders from the artifact of the case. */
const build = async ({ development = false } = {}) => {
  refreshWorkspaceArtifact();
  const ssr = await ssrData({ deployId: 'dd-cyberia', client: 'cyberia-public', development });
  const body = (await ssrFactory('./src/client/ssr/body/CyberiaPublicLanding.js'))({
    title: 'CYBERIA Online',
    description: 'Free browser MMORPG.',
    ssrPath: '/',
    data: ssr.data,
  });
  return { ...ssr, body };
};

describe('public website build from a content artifact', () => {
  it('stops on a missing artifact, before any artifact is open', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-site-no-artifact-'));
    roots.push(root);
    vi.stubEnv('CYBERIA_CONTENT_ROOT', root);
    await expect(build()).rejects.toThrow(/No content artifact/);
  });

  it('renders each published world once, with its play URL and its thumbnail images', async () => {
    writeArtifact(WORLDS());
    const { body, files, data } = await build();
    const cards = body.slice(body.indexOf('class="cp-worlds"'));
    expect(cards.match(/<li class="cp-world">/g)).toHaveLength(1);
    expect(cards).toContain('<h3>The Violet Strata</h3>');
    expect(cards).toContain(`href="https://services.fixture.test/launch?world=${DEFAULT_INSTANCE_CODE}"`);
    expect(body).not.toContain('Hidden');
    for (const { file } of data.worlds[0].thumbnail.srcset) {
      expect(Object.keys(files)).toContain(file);
      expect(body).toContain(`/${file}`);
    }
    expect((await sharp(files[data.worlds[0].thumbnail.src]).metadata()).width).toBe(768);
  });

  it('renders the empty state when the artifact publishes no world', async () => {
    const worlds = WORLDS();
    worlds[DEFAULT_INSTANCE_CODE].record.status = 'unlisted';
    writeArtifact(worlds);
    const { body, files } = await build();
    expect(body).toContain('class="cp-empty"');
    expect(files).toEqual({});
  });

  it('stops on an altered artifact', async () => {
    const { root } = writeArtifact(WORLDS());
    fs.writeFileSync(path.join(root, 'dist', 'instances', 'test', 'cyberia-instance.json'), '{"status":"published"}');
    await expect(build()).rejects.toThrow(/Content digest mismatch/);
  });

  it('reads in production only the artifact the deployment lock pins', async () => {
    const { manifest, deployment } = writeArtifact(WORLDS());
    const lock = (digest) =>
      fs.writeFileSync(
        path.join(deployment, 'underpost.lock.json'),
        JSON.stringify({
          lockVersion: 1,
          sources: {
            'cyberia-content': {
              repository: manifest.repository,
              revision: manifest.sourceRevision,
              artifact: { version: manifest.contentVersion, digest },
            },
          },
        }),
      );
    lock(manifest.contentDigest);
    expect((await build()).data.worlds).toHaveLength(1);
    lock(`sha256:${'0'.repeat(64)}`);
    await expect(build()).rejects.toThrow(/reads no deployed content/);
    expect((await build({ development: true })).data.worlds).toHaveLength(1);
  });
});
