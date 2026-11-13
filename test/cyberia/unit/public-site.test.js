import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_INSTANCE_CODE } from '../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

vi.mock('../../../src/projects/cyberia/runtime/game-origins.js', () => ({
  gameOrigins: (deployId, environment) => ({
    portal: environment === 'development' ? 'http://localhost:4004' : 'https://services.fixture.test',
  }),
}));

let artifact = null;
vi.mock('../../../src/projects/cyberia/content/content-artifact.js', async (importOriginal) => ({
  ...(await importOriginal()),
  contentArtifact: () => {
    if (!artifact) throw new Error('No content artifact at /fixture/dist');
    return artifact;
  },
}));

const { LISTED_STATUS, PUBLIC_SITE_CLIENT, artifactProvenance, listedWorlds, ssrData, worldThumbnail } =
  await import('../../../src/projects/cyberia/instance/public-worlds.js');
const { ssrFactory } = await import('../../../src/client-builder/ssr.js');

const services = 'https://services.fixture.test';
const RELEASED = [DEFAULT_INSTANCE_CODE, 'test'];

let THUMBNAIL;
beforeAll(async () => {
  THUMBNAIL = await sharp({ create: { width: 768, height: 576, channels: 4, background: '#0a1430' } })
    .png()
    .toBuffer();
});

let root;
const writeWorld = (code, record, files = {}) => {
  const dir = path.join(root, code);
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'cyberia-instance.json'), JSON.stringify({ code, ...record }));
  for (const [name, file] of Object.entries(files))
    fs.writeFileSync(path.join(dir, 'files', `${name}.json`), JSON.stringify(file));
  return dir;
};
const imageFile = (_id, bytes = THUMBNAIL) => ({
  _id,
  name: `${_id}.png`,
  mimetype: 'image/png',
  data: { $base64: bytes.toString('base64') },
});

const MANIFEST = {
  repository: 'underpostnet/cyberia-content',
  contentVersion: '1.0.0',
  sourceRevision: 'a'.repeat(40),
  contentDigest: `sha256:${'b'.repeat(64)}`,
  schemaVersion: 11,
};
const writeLock = (digest) =>
  fs.writeFileSync(
    path.join(process.env.CYBERIA_DEPLOYMENT_ROOT, 'underpost.lock.json'),
    JSON.stringify({
      lockVersion: 1,
      sources: {
        'cyberia-content': {
          repository: MANIFEST.repository,
          revision: MANIFEST.sourceRevision,
          artifact: { version: MANIFEST.contentVersion, digest },
        },
      },
    }),
  );

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-worlds-'));
  vi.stubEnv('CYBERIA_DEPLOYMENT_ROOT', fs.mkdtempSync(path.join(os.tmpdir(), 'public-worlds-deployment-')));
  artifact = {
    manifest: { ...MANIFEST, instances: [...RELEASED] },
    instanceDir: (code) => path.join(root, code),
  };
});

afterEach(() => {
  artifact = null;
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(process.env.CYBERIA_DEPLOYMENT_ROOT, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('world thumbnails', () => {
  it('gives the File a world names, by id, at its width and a smaller copy, under names that change with its bytes', async () => {
    const dir = writeWorld('alpha', {}, { audio: { _id: 'a1', mimetype: 'audio/ogg' }, shot: imageFile('t1') });
    const thumbnail = await worldThumbnail(dir, { code: 'alpha', thumbnail: 't1' });
    const name = (width) => new RegExp(`^worlds/alpha\\.[0-9a-f]{16}\\.${width}\\.png$`);
    expect(thumbnail).toMatchObject({ width: 768, height: 576 });
    expect(thumbnail.src).toMatch(name(768));
    expect(thumbnail.srcset.map(({ width }) => width)).toEqual([480, 768]);
    expect(thumbnail.srcset[0].file).toMatch(name(480));
    expect(thumbnail.files[thumbnail.src]).toEqual(THUMBNAIL);
    expect(await sharp(thumbnail.files[thumbnail.srcset[0].file]).metadata()).toMatchObject({
      width: 480,
      height: 360,
    });
    expect(await worldThumbnail(dir, { code: 'alpha' })).toBeNull();
  });

  it('keeps the format of a JPEG thumbnail', async () => {
    const jpeg = await sharp(THUMBNAIL).jpeg().toBuffer();
    const dir = writeWorld('alpha', {}, { shot: { ...imageFile('t1', jpeg), mimetype: 'image/jpeg' } });
    const thumbnail = await worldThumbnail(dir, { code: 'alpha', thumbnail: 't1' });
    expect(thumbnail.src).toMatch(/\.768\.jpg$/);
    expect((await sharp(thumbnail.files[thumbnail.srcset[0].file]).metadata()).format).toBe('jpeg');
  });

  it('refuses a named thumbnail that is missing or no image', async () => {
    const dir = writeWorld('alpha', {}, { text: imageFile('t2', Buffer.from('not an image')) });
    await expect(worldThumbnail(dir, { code: 'alpha', thumbnail: 't1' })).rejects.toThrow(
      /names thumbnail t1, which its files lack/,
    );
    await expect(worldThumbnail(dir, { code: 'alpha', thumbnail: 't2' })).rejects.toThrow(
      /is no PNG, JPEG or WebP image/,
    );
  });
});

describe('public website worlds', () => {
  it('lists the published worlds only, in release order, through the launch bridge', () => {
    const srcset = [{ file: 'worlds/violet.0.4.png', width: 4 }];
    const thumbnail = { src: 'worlds/violet.0.4.png', width: 4, height: 3, srcset, files: {} };
    const worlds = listedWorlds(
      [
        {
          record: { code: 'violet', name: ' The Violet Strata ', description: 'A world.', status: LISTED_STATUS },
          thumbnail,
        },
        { record: { code: 'test', name: 'test', status: 'unlisted' } },
        { record: { code: 'bare', name: 'Bare', status: LISTED_STATUS } },
      ],
      services,
    );
    expect(worlds).toEqual([
      {
        code: 'violet',
        name: 'The Violet Strata',
        description: 'A world.',
        href: `${services}/launch?world=violet`,
        thumbnail: { src: 'worlds/violet.0.4.png', width: 4, height: 3, srcset },
      },
      { code: 'bare', name: 'Bare', description: '', href: `${services}/launch?world=bare` },
    ]);
  });

  it.each([
    [{ code: 'bad code', name: 'x' }, /code "bad code" is invalid/],
    [{ code: 'nameless' }, /has no name/],
    [{ code: 'odd', name: 'Odd', description: 7 }, /invalid description/],
  ])('refuses a published world with an invalid record %#', (record, error) => {
    expect(() => listedWorlds([{ record: { ...record, status: LISTED_STATUS } }], services)).toThrow(error);
  });
});

describe('public website data', () => {
  const build = (development = false) => ssrData({ deployId: 'dd-cyberia', client: PUBLIC_SITE_CLIENT, development });

  it('gives data to the public client only', async () => {
    expect(await ssrData({ deployId: 'dd-cyberia', client: 'cyberia-portal', development: false })).toBeUndefined();
  });

  it('fails the build when the content artifact is missing, or lacks a released world', async () => {
    artifact = null;
    await expect(build()).rejects.toThrow(/No content artifact/);
    artifact = {
      manifest: { ...MANIFEST, instances: [DEFAULT_INSTANCE_CODE] },
      instanceDir: (code) => path.join(root, code),
    };
    writeWorld(DEFAULT_INSTANCE_CODE, { name: 'Default', status: 'unlisted' });
    await expect(build()).rejects.toThrow(/lacks the released world test/);
  });

  it('lists the published worlds with their thumbnail images, each written once', async () => {
    writeWorld(
      DEFAULT_INSTANCE_CODE,
      { name: 'Violet', description: 'A world.', status: LISTED_STATUS, thumbnail: 't1' },
      { shot: imageFile('t1') },
    );
    writeWorld('test', { name: 'test', status: 'unlisted', thumbnail: 't9' });
    const { data, files } = await build();
    expect(data.worlds.map((world) => world.code)).toEqual([DEFAULT_INSTANCE_CODE]);
    expect(Object.keys(files)).toEqual(data.worlds[0].thumbnail.srcset.map(({ file }) => file));
    expect(data.links).toEqual({
      play: `${services}/launch`,
      worlds: `${services}/instance-selection`,
      portal: `${services}/`,
      signUp: `${services}/sign-up`,
      studio: `${services}/cyberia-studio`,
      docs: `${services}/docs`,
      objectLayer: 'https://objectlayer.org',
      itemLedger: 'https://itemledger.com',
    });
  });

  it('gives an empty list, not a failure, when no world is published', async () => {
    for (const code of RELEASED) writeWorld(code, { name: code, status: 'unlisted' });
    const { data, files } = await build(true);
    expect(data.worlds).toEqual([]);
    expect(files).toEqual({});
    expect(data.links.portal).toBe('http://localhost:4004/');
  });

  it('states the provenance of the artifact, and reads only the locked artifact in production', () => {
    expect(artifactProvenance(MANIFEST, false)).toEqual({ ...MANIFEST, lock: 'none' });
    writeLock(MANIFEST.contentDigest);
    expect(artifactProvenance(MANIFEST, false).lock).toBe('locked');
    writeLock(`sha256:${'c'.repeat(64)}`);
    expect(() => artifactProvenance(MANIFEST, false)).toThrow(/reads no deployed content: .*artifact digest/);
    expect(artifactProvenance(MANIFEST, true).lock).toBe('unlocked');
  });
});

describe('public landing page', () => {
  const links = {
    play: `${services}/launch`,
    worlds: `${services}/instance-selection`,
    portal: `${services}/`,
    signUp: `${services}/sign-up`,
    studio: `${services}/cyberia-studio`,
    docs: `${services}/docs`,
    objectLayer: 'https://objectlayer.org',
  };
  const world = (code, name, thumbnail) => ({
    code,
    name,
    description: `About ${name}.`,
    href: `${services}/launch?world=${code}`,
    ...(thumbnail
      ? {
          thumbnail: {
            src: `worlds/${code}.0.768.png`,
            width: 768,
            height: 576,
            srcset: [
              { file: `worlds/${code}.0.480.png`, width: 480 },
              { file: `worlds/${code}.0.768.png`, width: 768 },
            ],
          },
        }
      : undefined),
  });
  const render = async (worlds, data = { links, worlds }) =>
    (await ssrFactory('./src/client/ssr/body/CyberiaPublicLanding.js'))({
      title: 'CYBERIA Online',
      description: 'Free browser MMORPG.',
      author: 'https://github.com/underpostnet',
      ssrPath: '/',
      data,
    });

  it('holds its content, landmarks and entry points in the HTML, with no script', async () => {
    const html = await render([world('a', 'Alpha & <Beta>', true)]);
    expect(html).not.toMatch(/<script/i);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<nav class="cp-nav" aria-label="Main">');
    expect(html).toContain('<main id="main">');
    expect(html).toContain('<a class="cp-skip" href="#main">');
    for (const section of ['worlds', 'studio', 'universe']) expect(html).toContain(`id="${section}"`);
    expect(html).toContain(`<a class="cp-button cp-button-ghost" href="${services}/">Open portal</a>`);
    expect(html).toContain(`href="${services}/cyberia-studio"`);
    expect(html).toContain(`href="${services}/launch?world=a"`);
    expect(html).toContain('href="https://objectlayer.org"');
    expect(html).toContain('Alpha &amp; &lt;Beta&gt;');
    expect(html).not.toContain('<Beta>');
  });

  it('shows the first world thumbnail in the hero, and the others lazily in their cards', async () => {
    const html = await render([world('a', 'Alpha', false), world('b', 'Beta', true), world('c', 'Gamma', true)]);
    const hero = html.slice(html.indexOf('cp-hero-art'), html.indexOf('id="worlds"'));
    expect(hero).toContain('src="/worlds/b.0.768.png"');
    expect(hero).toContain('srcset="/worlds/b.0.480.png 480w, /worlds/b.0.768.png 768w"');
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).toContain('<figcaption>Beta</figcaption>');
    const cards = html.slice(html.indexOf('class="cp-worlds"'));
    expect(cards).toMatch(/src="\/worlds\/c\.0\.768\.png"[^>]*sizes="[^"]+"\s+width="768"\s+height="576"/);
    expect(cards).toMatch(/class="cp-thumbnail"[^>]*alt="A scene of the world Gamma"\s+loading="lazy"/);
    expect(cards).toContain('Play<span class="cp-visually-hidden"> Alpha</span>');
  });

  it('shows the logo in the hero and an empty state when no world is published', async () => {
    const html = await render([]);
    expect(html).toContain('class="cp-hero-logo"');
    expect(html).toContain('class="cp-empty"');
    expect(html).toContain(`href="${services}/instance-selection"`);
  });

  it('holds a theme control the theme script shows: Auto, Light and Dark', async () => {
    const html = await render([]);
    expect(html).toContain('<fieldset class="cp-theme" hidden>');
    expect(html).toContain('<legend class="cp-visually-hidden">Color theme</legend>');
    for (const value of ['system', 'light', 'dark'])
      expect(html).toContain(`<input type="radio" name="cp-theme" value="${value}" />`);
  });

  it('renders without project data, and leaves out the links it lacks', async () => {
    const landing = await ssrFactory('./src/client/ssr/body/CyberiaPublicLanding.js');
    const html = landing({ title: 't', description: 'd', ssrPath: '/' });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Open portal');
    expect(html).toContain('class="cp-empty"');
  });
});

describe('public website styles', () => {
  it('apply the stored theme before the first paint, else the color scheme of the visitor', async () => {
    const head = (await ssrFactory('./src/client/ssr/head/CyberiaPublicCss.js'))({ ssrPath: '/' });
    expect(head.indexOf('<script>')).toBeLessThan(head.indexOf('<style>'));
    expect(head).toContain("const key = 'cyberia-color-scheme';");
    expect(head).toMatch(
      /@media \(prefers-color-scheme: light\) \{\s+:root:not\(\[data-color-scheme='dark'\]\) \{\s+color-scheme: light;/,
    );
    expect(head).toMatch(/:root\[data-color-scheme='light'\] \{\s+color-scheme: light;/);
    expect(head).toContain(":root[data-color-scheme='dark'] {");
    expect(head).toContain('@media (prefers-reduced-motion: reduce)');
    expect(head).toContain('<link rel="preload" href="/assets/fonts/Jersey15-Regular.ttf" as="font"');
  });

  it('give every card image one height, covered by its thumbnail, with a zoom that reduced motion stops', async () => {
    const head = (await ssrFactory('./src/client/ssr/head/CyberiaPublicCss.js'))({ ssrPath: '/' });
    expect(head).toMatch(/\.cp-world-art \{[^}]*height: 12rem;[^}]*overflow: hidden;/);
    expect(head).toMatch(/\.cp-world-art \.cp-thumbnail \{[^}]*object-fit: cover;[^}]*object-position: center;/);
    expect(head).toMatch(
      /\.cp-world:hover \.cp-thumbnail,\s+\.cp-world:focus-within \.cp-thumbnail \{\s+transform: scale\(1\.06\);/,
    );
    const reduced = head.slice(head.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.cp-world:focus-within \.cp-thumbnail \{\s+transform: none;/);
  });
});
