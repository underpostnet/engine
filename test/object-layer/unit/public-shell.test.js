import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import {
  buildObjectLayerMetadata,
  objectLayerShellRendererFactory,
} from '../../../src/server/network/object-layer-metadata.js';
import { shellContext } from '../../../src/server/network/shell-metadata.js';

const CID = 'bafkreiffm7bhq4erjqglbx7fh5todzdt4adjdq7fjbhhz7lojzgyrf54q4';
const site = { title: 'Cyberia Online', siteName: 'Cyberia', description: 'An MMORPG', thumbnail: 'assets/social.png' };
const context = {
  ...shellContext({ host: 'www.cyberiaonline.com', path: '/', metadata: site }),
  previewBase: 'https://www.cyberiaonline.com/api/v1',
};
const definition = (overrides = {}) => ({
  cid: CID,
  data: {
    item: { id: 'atlas_pistol_mk2', type: 'weapon', description: 'A compact sidearm.' },
    render: { cid: 'bafkreirender' },
  },
  archivedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  ...overrides,
});
const shell =
  '<!doctype html><html><head><title>Cyberia</title><meta name="description" content="site"></head><body></body></html>';

describe('object layer shell metadata', () => {
  it('titles and describes the page with the item, at the canonical path of its cid', () => {
    const metadata = buildObjectLayerMetadata(definition(), context);
    expect(metadata).toMatchObject({
      title: 'atlas_pistol_mk2 | Cyberia',
      headline: 'atlas_pistol_mk2',
      description: 'A compact sidearm.',
      canonicalUrl: `https://www.cyberiaonline.com/object-layer/${CID}`,
      siteName: 'Cyberia',
      type: 'website',
    });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.jsonLd).toMatchObject({ '@type': 'CreativeWork', identifier: CID, genre: 'weapon' });
  });

  it('shows the idle preview of a rendered definition, else the site image', () => {
    const idle = `https://www.cyberiaonline.com/api/v1/atlas-sprite-sheet/idle-preview/${CID}`;
    expect(buildObjectLayerMetadata(definition(), context).image).toEqual({ url: idle, representative: true });
    expect(buildObjectLayerMetadata(definition(), context).jsonLd.image).toEqual([idle]);
    const unrendered = definition({ data: { item: { id: 'purple', type: 'skin' } } });
    expect(buildObjectLayerMetadata(unrendered, context).image).toEqual({
      url: 'https://www.cyberiaonline.com/assets/social.png',
      representative: false,
    });
    expect(buildObjectLayerMetadata(unrendered, context).jsonLd.image).toBeUndefined();
  });

  it('takes the idle preview from the host that serves it, and the page from the host that presents it', () => {
    const ledger = { ...shellContext({ host: 'itemledger.com', path: '/', metadata: site }), previewBase: '' };
    expect(buildObjectLayerMetadata(definition(), ledger).image.representative).toBe(false);
    const metadata = buildObjectLayerMetadata(definition(), {
      ...ledger,
      previewBase: 'https://objectlayer.org/api/v1',
    });
    expect(metadata.image.url).toBe(`https://objectlayer.org/api/v1/atlas-sprite-sheet/idle-preview/${CID}`);
    expect(metadata.canonicalUrl).toBe(`https://itemledger.com/object-layer/${CID}`);
  });

  it('describes an item without a description by its type', () => {
    const skin = definition({ data: { item: { id: 'purple', type: 'skin' } } });
    expect(buildObjectLayerMetadata(skin, context).description).toBe('Skin object layer');
  });

  it('does not index an archived or an unresolved definition', () => {
    expect(buildObjectLayerMetadata(definition({ archivedAt: new Date() }), context).robots).toBe('noindex');
    expect(buildObjectLayerMetadata(null, context)).toEqual({ robots: 'noindex' });
  });
});

describe('object layer shell renderer', () => {
  let lookups;
  let answer;
  beforeEach(() => {
    lookups = [];
    answer = async (cid) => (cid === CID ? definition() : null);
    const ObjectLayer = {
      findByCid: (cid) => {
        lookups.push(cid);
        return { lean: () => answer(cid) };
      },
    };
    vi.spyOn(DataBaseProviderService, 'getModel').mockReturnValue(ObjectLayer);
  });
  afterEach(() => vi.restoreAllMocks());

  const render = objectLayerShellRendererFactory({
    host: 'www.cyberiaonline.com',
    path: '/',
    metadata: site,
    apis: ['object-layer', 'atlas-sprite-sheet'],
  });

  it('writes the definition the cid names into the shell head', async () => {
    const html = await render({}, shell, CID);
    expect(html).toContain('<title>atlas_pistol_mk2 | Cyberia</title>');
    expect(html).toContain(`<link rel="canonical" href="https://www.cyberiaonline.com/object-layer/${CID}">`);
    expect(html).toContain(
      '<meta property="og:image" content="https://www.cyberiaonline.com/api/v1/atlas-sprite-sheet/idle-preview/',
    );
    expect(html).not.toContain('content="site"');
  });

  it('marks a missing definition noindex, and never looks up a slug that is not a cid', async () => {
    const missing = CID.replace('4q4', 'aaa');
    expect(await render({}, shell, missing)).toContain('<meta name="robots" content="noindex">');
    expect(await render({}, shell, 'atlas-pistol-mk2')).toContain('<meta name="robots" content="noindex">');
    expect(lookups).toEqual([missing]);
  });

  it('serves the shell as built when the definition cannot be read', async () => {
    answer = async () => {
      throw new Error('the authority did not answer');
    };
    expect(await render({}, shell, CID)).toBe(shell);
  });
});
