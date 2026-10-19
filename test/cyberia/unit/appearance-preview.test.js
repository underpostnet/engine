import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

// An in-memory Valkey, so the render cache keeps what it stores.
const valkey = new Map();
vi.mock('../../../src/db/valkey/Valkey.js', () => ({
  ValkeyAPI: {
    isConnected: () => true,
    get: async (_options, key) => (valkey.has(key) ? JSON.parse(valkey.get(key)) : null),
    set: async (_options, key, value) => valkey.set(key, JSON.stringify(value)),
    incr: async () => 1,
  },
}));

// The definitions, atlases and idle preview Files of a host; `reads` counts the Files a drawing reads.
const host = vi.hoisted(() => ({ types: new Map(), stills: new Map(), files: new Map(), reads: 0, failing: false }));
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: {
    getModel: (name) =>
      ({
        ObjectLayer: {
          find: ({ cid }) => ({
            lean: async () =>
              cid.$in
                .filter((key) => host.types.has(key))
                .map((key) => ({ cid: key, data: { item: { type: host.types.get(key) } } })),
          }),
        },
        AtlasSpriteSheet: {
          find: ({ objectLayerCid }) => ({
            lean: async () =>
              objectLayerCid.$in
                .filter((key) => host.stills.has(key))
                .map((key) => ({ objectLayerCid: key, idlePreviewFileId: host.stills.get(key) })),
          }),
        },
      })[name],
  },
}));
vi.mock('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js', () => ({
  renderFileBytes: async (fileId) => {
    host.reads++;
    return host.failing ? null : host.files.get(fileId);
  },
}));

const {
  appearanceCids,
  appearanceFingerprint,
  appearanceLayers,
  appearancePreview,
  appearanceReference,
  composeAppearance,
  previewQueue,
} = await import('../../../src/projects/cyberia/player/appearance-preview.js');

const cid = (letter) => `bafkrei${letter.repeat(52)}`;
const [BODY, WEAPON, WEAPON_STATS, GEM, CAPE, SCARF, ELSEWHERE] = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(cid);
const OPTIONS = { host: 'test', path: '/' };

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const fill = (width, height, color) =>
  sharp({ create: { width, height, channels: 4, background: { r: color[0], g: color[1], b: color[2], alpha: 1 } } })
    .png()
    .toBuffer();
// A weapon still: one green corner on a clear square, as an idle preview holds it.
const corner = async () =>
  sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await fill(150, 150, GREEN), left: 150, top: 0 }])
    .png()
    .toBuffer();
const pixelOf = async (image, x, y) => {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * 4;
  return [...data.subarray(at, at + 4)];
};

const place = (key, type, still) => {
  host.types.set(key, type);
  if (still) host.stills.set(key, still);
};

beforeEach(async () => {
  valkey.clear();
  Object.assign(host, { reads: 0, failing: false });
  host.files = new Map([
    ['still-body', await fill(300, 300, RED)],
    ['still-weapon', await corner()],
    ['still-cape', await fill(150, 300, BLUE)],
  ]);
  place(BODY, 'skin', 'still-body');
  place(WEAPON, 'weapon', 'still-weapon');
  // Another definition of the weapon, with other stats: the same render, the same idle preview.
  place(WEAPON_STATS, 'weapon', 'still-weapon');
  place(GEM, 'consumable', null);
  place(CAPE, 'breastplate', 'still-cape');
  place(SCARF, 'breastplate', 'still-weapon');
});

describe('identity previews', () => {
  it('are named by canonical Object Layer CIDs, at most the contract allows', () => {
    expect(appearanceCids(`${BODY},${WEAPON}`)).toEqual([BODY, WEAPON]);
    expect(() => appearanceCids('')).toThrow('Invalid appearance');
    expect(() => appearanceCids('file:///etc/passwd')).toThrow('Invalid appearance');
    expect(() => appearanceCids(Array(21).fill(BODY).join(','))).toThrow('Invalid appearance');
    expect(appearanceReference([BODY, WEAPON])).toBe(`/api/v1/cyberia-player/appearance/v1/${BODY},${WEAPON}`);
    expect(appearanceReference([])).toBe('');
  });

  it('overlay the stored idle previews in draw order, and fingerprint only those', async () => {
    const layers = await appearanceLayers([WEAPON, GEM, ELSEWHERE, BODY], OPTIONS);
    expect(layers).toEqual([
      { cid: BODY, priority: 10, still: 'still-body' },
      { cid: WEAPON, priority: 40, still: 'still-weapon' },
    ]);
    const fingerprint = async (cids) => appearanceFingerprint(await appearanceLayers(cids, OPTIONS));
    const worn = await fingerprint([BODY, WEAPON]);
    // A new stat set, a layer without an idle preview, and an unknown layer draw the same pixels.
    expect(await fingerprint([BODY, WEAPON_STATS])).toBe(worn);
    expect(await fingerprint([BODY, GEM, ELSEWHERE, WEAPON])).toBe(worn);
    // Layers of one priority keep their order, so their order is part of the image.
    expect(await fingerprint([BODY, CAPE, SCARF])).not.toBe(await fingerprint([BODY, SCARF, CAPE]));
    expect(await fingerprint([BODY])).not.toBe(worn);
  });

  it('draw every still over the one before, each centred on the idle preview square', async () => {
    const image = await composeAppearance([...host.files.values()]);
    expect((await sharp(image).metadata()).width).toBe(300);
    expect(await pixelOf(image, 20, 20)).toEqual(RED);
    expect(await pixelOf(image, 280, 20)).toEqual(GREEN);
    expect(await pixelOf(image, 150, 280)).toEqual(BLUE);
    expect(await pixelOf(image, 20, 280)).toEqual(RED);
  });

  it('draw once for concurrent requests of one fingerprint and serve the cached image after', async () => {
    const [first, second, third] = await Promise.all([
      appearancePreview([BODY, WEAPON], OPTIONS),
      appearancePreview([BODY, WEAPON], OPTIONS),
      appearancePreview([BODY, WEAPON_STATS], OPTIONS),
    ]);
    expect(host.reads).toBe(2);
    expect(second.png.equals(first.png) && third.fingerprint === first.fingerprint).toBe(true);
    expect(await pixelOf(first.png, 280, 20)).toEqual(GREEN);
    await appearancePreview([BODY, WEAPON], OPTIONS);
    expect(host.reads).toBe(2);
  });

  it('keep no failed drawing, so the next request draws again', async () => {
    host.failing = true;
    await expect(appearancePreview([BODY, WEAPON], OPTIONS)).rejects.toMatchObject({ status: 503 });
    host.failing = false;
    const { png } = await appearancePreview([BODY, WEAPON], OPTIONS);
    expect(await pixelOf(png, 20, 20)).toEqual(RED);
    await expect(appearancePreview([GEM, ELSEWHERE], OPTIONS)).rejects.toMatchObject({ status: 404 });
  });

  it('run a bounded number of drawings and refuse past the waiting room', async () => {
    const queue = previewQueue({ concurrency: 1, capacity: 1 });
    let running = 0;
    let release;
    const job = () => {
      running++;
      expect(running).toBe(1);
      return new Promise((resolve) => (release = resolve)).finally(() => running--);
    };
    const first = queue(job);
    const second = queue(async () => {
      expect(running).toBe(0);
      return 'second';
    });
    await expect(queue(async () => 'third')).rejects.toMatchObject({ status: 503 });
    release('first');
    expect(await first).toBe('first');
    expect(await second).toBe('second');
  });
});
