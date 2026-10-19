import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

// A world preview draws each map at the proportions of its grid on its layout cell, with the portals
// between maps, and the world stores it under a key that names every input.
const store = vi.hoisted(() => ({ instance: null, maps: [], files: new Map(), refreshed: [], saved: 0, nextId: 0 }));
vi.mock('../../../src/db/DataBaseProvider.js', () => {
  const query = (value) => ({ lean: async () => value, then: (resolve) => resolve(value) });
  const matches = (value, expected) =>
    expected && typeof expected === 'object' && '$in' in expected
      ? expected.$in.includes(value ?? null)
      : value === expected;
  const models = {
    CyberiaInstance: {
      findOne: () => query(store.instance && { ...store.instance }),
      find: () => query(store.instance ? [{ code: store.instance.code }] : []),
      exists: async ({ preview }) => store.instance?.preview === preview,
      updateOne: async ({ previewKey }, { $set }) => {
        if (!matches(store.instance.previewKey, previewKey)) return { matchedCount: 0 };
        Object.assign(store.instance, $set);
        return { matchedCount: 1 };
      },
    },
    CyberiaMap: {
      find: () => ({ select: () => ({ lean: async () => store.maps.map((map) => ({ ...map })) }) }),
      findOne: ({ code }) => query({ preview: store.maps.find((map) => map.code === code)?.preview }),
    },
    File: Object.assign(
      function File(doc) {
        return {
          save: async () => {
            const _id = `file-${++store.nextId}`;
            store.files.set(_id, doc.data);
            store.saved++;
            return { _id };
          },
        };
      },
      {
        find: ({ _id }) =>
          query(_id.$in.filter((id) => store.files.has(id)).map((id) => ({ _id: id, data: store.files.get(id) }))),
        findOne: ({ _id }) => query(store.files.has(_id) ? { data: store.files.get(_id) } : null),
        deleteOne: async ({ _id }) => store.files.delete(_id),
      },
    ),
  };
  return { DataBaseProviderService: { getModel: (name) => models[name] } };
});
vi.mock('../../../src/api/file/file.service.js', () => ({ FileFactory: { create: (data) => ({ data }) } }));
vi.mock('../../../src/projects/cyberia/instance/map-preview-generator.js', () => ({
  refreshMapPreview: async (map) => {
    store.refreshed.push(map.code);
    const picture = store.pictures[map.code] ?? null;
    const stored = store.maps.find(({ code }) => code === map.code);
    if (picture) {
      stored.preview = `file-${map.code}`;
      store.files.set(stored.preview, picture);
    } else delete stored.preview;
    return picture;
  },
}));

const {
  composeWorldPreview,
  refreshWorldPreviews,
  worldPreview,
  worldPreviewGeometry,
  worldPreviewKey,
  worldPreviewSize,
} = await import('../../../src/projects/cyberia/instance/world-preview.js');

const square = (color, width = 16, height = 16) =>
  sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
const pixelAt = async (png, x, y) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (Math.round(y) * info.width + Math.round(x)) * 4;
  return [data[at], data[at + 1], data[at + 2]];
};
const FRAME = [18, 28, 48];
const BACKGROUND = [7, 11, 20];
const wide = { code: 'wide', gridX: 32, gridY: 16 };
const tall = { code: 'tall', gridX: 16, gridY: 32 };
const center = (rect) => [rect.left + rect.width / 2, rect.top + rect.height / 2];

describe('world preview geometry', () => {
  it('gives every map the proportions of its grid at one scale, centred in its cell', () => {
    const { width, height, rects } = worldPreviewGeometry(
      [wide, tall],
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    );
    expect(width).toBe(2 * height);
    expect(rects[0].width / rects[0].height).toBeCloseTo(2, 1);
    expect(rects[1].height / rects[1].width).toBeCloseTo(2, 1);
    expect(rects[0].width).toBe(rects[1].height);
    const near = ([x, y], [ex, ey]) => Math.abs(x - ex) <= 0.5 && Math.abs(y - ey) <= 0.5;
    expect(near(center(rects[0]), [height / 2, height / 2])).toBe(true);
    expect(near(center(rects[1]), [height * 1.5, height / 2])).toBe(true);
  });

  it('joins maps whose places share an edge, and sets the other maps beside them', () => {
    const placed = (code, worldX, worldY) => ({ code, gridX: 16, gridY: 16, worldX, worldY });
    const maps = [placed('a', 0, 0), placed('b', 16, 0), placed('c', 0, 16), { code: 'loose', gridX: 16, gridY: 16 }];
    const { width, height, rects } = worldPreviewGeometry(maps, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    const [a, b, c, loose] = rects;
    expect(a.left + a.width).toBe(b.left);
    expect(a.top + a.height).toBe(c.top);
    expect(a.top).toBe(b.top);
    expect(a.width).toBe(b.width);
    expect([a.placed, loose.placed]).toEqual([true, false]);
    expect(loose.left).toBeGreaterThan(b.left + b.width);
    expect(loose.left + loose.width).toBeLessThanOrEqual(width);
    expect(c.top + c.height).toBeLessThanOrEqual(height);
  });

  it('drops the empty rows and columns of the layout, as the in-game views do', () => {
    const square = (code) => ({ code, gridX: 16, gridY: 16 });
    const sparse = worldPreviewGeometry(
      [square('a'), square('b')],
      [
        { x: 0, y: 0 },
        { x: 3, y: 2 },
      ],
    );
    const dense = worldPreviewGeometry(
      [square('a'), square('b')],
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    );
    expect(sparse).toEqual(dense);
    expect(sparse.width).toBe(sparse.height);
  });

  it('gives a world card the proportions of its preview', () => {
    const instance = { cyberiaMapCodes: ['wide', 'tall', 'gone'] };
    expect(worldPreviewSize(instance, [tall, wide])).toEqual({ w: 1, h: 0.5 });
    expect(worldPreviewSize({ cyberiaMapCodes: ['wide'] }, [wide])).toEqual({ w: 1, h: 1 });
    expect(worldPreviewSize({ cyberiaMapCodes: [] }, [])).toEqual({ w: 1, h: 1 });
    const row = { ...wide, worldX: 0, worldY: 0 };
    const placedSize = worldPreviewSize({ cyberiaMapCodes: ['wide'] }, [row]);
    expect(placedSize.w).toBe(1);
    expect(placedSize.h).toBeCloseTo(0.5, 1);
  });

  it('keeps every preview inside the longest side, however wide the layout', () => {
    const maps = Array.from({ length: 40 }, (_, i) => ({ code: `m${i}`, gridX: 16, gridY: 16 }));
    const { width } = worldPreviewGeometry(
      maps,
      maps.map((_, x) => ({ x, y: 0 })),
    );
    expect(width).toBeLessThanOrEqual(768);
  });
});

describe('world preview drawing', () => {
  const cells = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];

  it('contains each picture in its map, a frame where a map shows nothing, and draws the portals between maps', async () => {
    const portals = [
      {
        sourceMapCode: 'wide',
        sourceCellX: -1,
        sourceCellY: -1,
        targetMapCode: 'tall',
        targetCellX: -1,
        targetCellY: -1,
      },
      {
        sourceMapCode: 'tall',
        sourceCellX: 0,
        sourceCellY: 0,
        targetMapCode: 'elsewhere',
        targetCellX: 0,
        targetCellY: 0,
      },
    ];
    const png = await composeWorldPreview({
      maps: [wide, tall],
      cells,
      portals,
      pictures: [await square('#ff0000', 64, 32), null],
    });
    const { rects } = worldPreviewGeometry([wide, tall], cells);
    expect(await pixelAt(png, rects[0].left + 4, rects[0].top + 4)).toEqual([255, 0, 0]);
    expect(await pixelAt(png, rects[1].left + 4, rects[1].top + rects[1].height - 6)).toEqual(FRAME);
    const [, y] = center(rects[0]);
    const between = await pixelAt(png, (rects[0].left + rects[0].width + rects[1].left) / 2, y);
    expect(between[2]).toBeGreaterThan(100);
    expect(between[0]).toBeLessThan(100);
    expect(await pixelAt(png, 2, 2)).toEqual(BACKGROUND);
  });

  it('never stretches a picture: one of another shape sits centred in its map', async () => {
    const png = await composeWorldPreview({
      maps: [wide],
      cells: [{ x: 0, y: 0 }],
      portals: [],
      pictures: [await square('#00ff00', 16, 16)],
    });
    const [rect] = worldPreviewGeometry([wide], [{ x: 0, y: 0 }]).rects;
    expect(await pixelAt(png, ...center(rect))).toEqual([0, 255, 0]);
    expect(await pixelAt(png, rect.left + 3, rect.top + rect.height / 2)).toEqual(FRAME);
  });
});

describe('the stored world preview', () => {
  beforeEach(async () => {
    store.pictures = { m1: await square('#ff0000'), m2: await square('#00ff00') };
    store.instance = {
      _id: 'i1',
      code: 'forest',
      cyberiaMapCodes: ['m1', 'm2', 'm3'],
      mapLayout: [{ mapCode: 'm2', x: 2, y: 1 }],
      portals: [
        { sourceMapCode: 'm1', sourceCellX: 1, sourceCellY: 1, targetMapCode: 'm2', targetCellX: 2, targetCellY: 2 },
      ],
    };
    store.maps = [
      { code: 'm1', gridX: 16, gridY: 16, preview: 'file-m1' },
      { code: 'm2', gridX: 32, gridY: 16 },
      { code: 'm3', gridX: 16, gridY: 16, preview: 'file-gone' },
    ];
    store.files = new Map([['file-m1', store.pictures.m1]]);
    store.refreshed = [];
    store.saved = 0;
  });

  it('draws the maps that show nothing yet, then stores the preview under the key of what it shows', async () => {
    const { key, png } = await worldPreview('forest', {});
    expect(store.refreshed).toEqual(['m2', 'm3']);
    expect(store.instance.previewKey).toBe(key);
    expect(store.files.get(store.instance.preview)).toBe(png);
    expect((await sharp(png).metadata()).format).toBe('png');
  });

  it('serves the stored preview while the world is the same, and draws a changed world once', async () => {
    const first = await worldPreview('forest', {});
    const stored = store.instance.preview;
    expect((await worldPreview('forest', {})).key).toBe(first.key);
    expect(store.saved).toBe(1);

    store.maps[1].gridY = 32;
    const second = await worldPreview('forest', {});
    expect(second.key).not.toBe(first.key);
    expect(store.saved).toBe(2);
    expect(store.files.has(stored)).toBe(false);
    expect(store.instance.preview).not.toBe(stored);
  });

  it('keys a preview by the generator, the world, each map, picture and cell, and each portal', () => {
    const maps = [{ code: 'm1', gridX: 16, gridY: 16, preview: 'a' }];
    const cellsOf = (x) => [{ x, y: 0 }];
    const portal = {
      sourceMapCode: 'm1',
      sourceCellX: 0,
      sourceCellY: 0,
      targetMapCode: 'm1',
      targetCellX: 3,
      targetCellY: 3,
    };
    const key = worldPreviewKey('forest', maps, cellsOf(0), [portal]);
    expect(worldPreviewKey('forest', maps, cellsOf(0), [portal])).toBe(key);
    for (const changed of [
      worldPreviewKey('desert', maps, cellsOf(0), [portal]),
      worldPreviewKey('forest', [{ ...maps[0], preview: 'b' }], cellsOf(0), [portal]),
      worldPreviewKey('forest', [{ ...maps[0], gridX: 32 }], cellsOf(0), [portal]),
      worldPreviewKey('forest', maps, cellsOf(1), [portal]),
      worldPreviewKey('forest', maps, cellsOf(0), []),
      worldPreviewKey(
        'forest',
        [...maps, { code: 'm2', gridX: 16, gridY: 16 }],
        [...cellsOf(0), { x: 1, y: 0 }],
        [portal],
      ),
    ])
      expect(changed).not.toBe(key);
  });

  it('answers 404 for an unknown world and for a world with no map', async () => {
    store.instance = null;
    await expect(worldPreview('nowhere', {})).rejects.toMatchObject({ status: 404 });
    store.instance = { _id: 'i2', code: 'void', cyberiaMapCodes: [] };
    await expect(worldPreview('void', {})).rejects.toMatchObject({ status: 404 });
  });

  it('brings the preview of each world that holds a changed map in line', async () => {
    expect(await refreshWorldPreviews({ mapCodes: ['m1'], options: {} })).toEqual({ current: 1, failed: [] });
    expect(store.instance.previewKey).not.toBe('');
  });
});
