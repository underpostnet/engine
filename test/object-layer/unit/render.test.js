import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import sharp from 'sharp';

// A definition's render, served by any host that holds the definition: from IPFS by the cids
// the definition names, cut by the real generator.
const models = {};
const ipfs = new Map();
vi.mock('../../../src/db/DataBaseProvider.js', () => ({
  DataBaseProviderService: { getModel: (name) => models[name] },
}));
vi.mock('../../../src/api/ipfs/ipfs.client.js', () => ({
  IpfsClient: { getFromIpfs: async (cid) => ipfs.get(cid) ?? null },
}));

const { AtlasSpriteSheetService } = await import('../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.service.js');
const { renderContractOf } = await import('../../../src/api/object-layer/object-layer.identity.js');

const CID = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku';
// A definition whose render is an upscaled render: its bytes carry 3 px per cell.
const UPSCALED_CID = `bafkrei${'a'.repeat(52)}`;
// A definition this host materializes: its atlas holds the bytes its render cids name.
const LOCAL_CID = `bafkrei${'b'.repeat(52)}`;
const RENDER = 'bafkreirender';
const UPSCALED_RENDER = 'bafkreiupscaledrender';
const LAYOUT = 'bafkreilayout';
const cell = { width: 2, height: 2 };
// Two 2×2-cell frames, one pixel per cell, upscale 3: one for down idle (08), two for down walk (18).
const layout = {
  itemKey: 'hatchet',
  atlasWidth: 4,
  atlasHeight: 2,
  cellPixelDim: 1,
  upscaleFactor: 3,
  frame_duration: 180,
  frames: {
    down_idle: [{ x: 0, y: 0, ...cell, frameIndex: 0 }],
    down_walking: [
      { x: 0, y: 0, ...cell, frameIndex: 0 },
      { x: 2, y: 0, ...cell, frameIndex: 1 },
    ],
  },
};

// A Mongoose query runs once: awaiting it a second time throws, as the driver does.
const query = (doc) => {
  let executed = false;
  const exec = async () => {
    if (executed) throw new Error('Query was already executed');
    executed = true;
    return doc;
  };
  return { exec, then: (resolve, reject) => exec().then(resolve, reject) };
};
const lean = (doc) => ({ select: () => ({ lean: () => query(doc) }), lean: () => query(doc) });
const request = (params) => {
  const headers = {};
  return { req: { params }, res: { set: (name, value) => (headers[name] = value) }, headers };
};

// Two colours, one per frame: an encoder merges identical frames.
const renderAt = async (pixelsPerCell) => {
  const square = 2 * pixelsPerCell;
  const second = await sharp({ create: { width: square, height: square, channels: 4, background: '#ffcc00' } })
    .png()
    .toBuffer();
  return await sharp({ create: { width: 2 * square, height: square, channels: 4, background: '#224466' } })
    .composite([{ input: second, left: square, top: 0 }])
    .png()
    .toBuffer();
};
const pixels = async (png) => await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

beforeAll(async () => {
  ipfs.set(RENDER, await renderAt(1));
  ipfs.set(UPSCALED_RENDER, await renderAt(3));
  ipfs.set(LAYOUT, Buffer.from(JSON.stringify(layout)));
});

const definitions = {
  [CID]: { cid: CID, data: { render: { cid: RENDER, metadataCid: LAYOUT } } },
  [UPSCALED_CID]: {
    cid: UPSCALED_CID,
    data: { render: { cid: UPSCALED_RENDER, metadataCid: LAYOUT } },
  },
};

beforeEach(() => {
  models.ObjectLayer = { findByCid: (cid) => lean(definitions[cid] ?? null) };
  models.AtlasSpriteSheet = { findOne: () => lean(null) };
  models.File = { findById: async () => null };
});

describe('the render of a definition', () => {
  it('counts frames per direction code, with the frame duration, and marks the answer immutable', async () => {
    const { req, res, headers } = request({ cid: CID });
    const { frameDuration, frameCounts } = await AtlasSpriteSheetService.frameCounts(req, res, {});
    expect(frameDuration).toBe(180);
    expect(frameCounts).toMatchObject({ '08': 1, 18: 2, '02': 0 });
    expect(headers['Cache-Control']).toMatch(/immutable/);
  });

  it('animates a direction of several frames, and stills a direction of one', async () => {
    const walk = request({ cid: CID, directionCode: '18' });
    const animated = await AtlasSpriteSheetService.animation(walk.req, walk.res, {});
    const walkMeta = await sharp(animated.buffer, { animated: true }).metadata();
    expect([animated.mimetype, walkMeta.pages, walkMeta.width, walkMeta.pageHeight]).toEqual(['image/webp', 2, 6, 6]);

    const idle = request({ cid: CID, directionCode: '08' });
    const still = await AtlasSpriteSheetService.animation(idle.req, idle.res, {});
    expect((await sharp(still.buffer).metadata()).format).toBe('webp');

    const none = request({ cid: CID, directionCode: '02' });
    await expect(AtlasSpriteSheetService.animation(none.req, none.res, {})).rejects.toMatchObject({ status: 404 });
  });

  it('derives the idle preview on a 300 px square, from IPFS on a host without the atlas', async () => {
    const fromIpfs = request({ key: CID });
    const still = await AtlasSpriteSheetService.idlePreview(fromIpfs.req, fromIpfs.res, {});
    expect(await sharp(still.buffer).metadata()).toMatchObject({ format: 'png', width: 300, height: 300 });
    expect(fromIpfs.headers['Cache-Control']).toMatch(/immutable/);
  });

  it("reads the render from this host's atlas, never IPFS, when its bytes are the ones the definition names", async () => {
    const primary = ipfs.get(RENDER);
    const render = renderContractOf({ primary, metadata: layout });
    definitions[LOCAL_CID] = { cid: LOCAL_CID, data: { render } };
    models.AtlasSpriteSheet = {
      findOne: ({ objectLayerCid }) =>
        lean(objectLayerCid === LOCAL_CID ? { fileId: 'f-local', metadata: layout } : null),
    };
    models.File = { findById: async (id) => (id === 'f-local' ? { data: primary } : null) };

    const pinned = request({ cid: LOCAL_CID });
    expect((await AtlasSpriteSheetService.definitionRender(pinned.req, pinned.res, {})).buffer.equals(primary)).toBe(
      true,
    );
    const answer = request({ cid: LOCAL_CID });
    expect((await AtlasSpriteSheetService.layout(answer.req, answer.res, {})).layout).toEqual(layout);
    expect(ipfs.has(render.cid) || ipfs.has(render.metadataCid)).toBe(false);
  });

  it('reads IPFS when the atlas of this host holds other bytes than the definition names', async () => {
    definitions[LOCAL_CID] = { ...definitions[CID], cid: LOCAL_CID };
    models.AtlasSpriteSheet = {
      findOne: () => lean({ fileId: 'f-other', metadata: { ...layout, frame_duration: 1 } }),
    };
    models.File = { findById: async () => ({ data: Buffer.from('other bytes') }) };

    const answer = request({ cid: LOCAL_CID });
    expect(
      (await AtlasSpriteSheetService.definitionRender(answer.req, answer.res, {})).buffer.equals(ipfs.get(RENDER)),
    ).toBe(true);
    expect((await AtlasSpriteSheetService.layout(request({ cid: LOCAL_CID }).req, answer.res, {})).layout).toEqual(
      layout,
    );
  });

  it('serves the metadata and the primary render a definition names, as pinned, and its upscaled render', async () => {
    const layoutAnswer = request({ cid: CID });
    expect(await AtlasSpriteSheetService.layout(layoutAnswer.req, layoutAnswer.res, {})).toEqual({
      renderCid: RENDER,
      metadataCid: LAYOUT,
      layout,
    });
    expect(layoutAnswer.headers['Cache-Control']).toMatch(/immutable/);

    const full = request({ cid: CID });
    const pinned = await AtlasSpriteSheetService.definitionRender(full.req, full.res, {});
    expect([pinned.mimetype, pinned.buffer.equals(ipfs.get(RENDER))]).toEqual(['image/png', true]);

    const human = request({ cid: CID, scale: 'upscaled' });
    const upscaled = await AtlasSpriteSheetService.definitionRender(human.req, human.res, {});
    const { data, info } = await pixels(upscaled.buffer);
    // 4×2 cells at 3 px per cell: the first frame's colour, then the second's, every pixel exact.
    expect([info.width, info.height]).toEqual([12, 6]);
    expect([...data.subarray(0, 4)]).toEqual([0x22, 0x44, 0x66, 255]);
    expect([...data.subarray(5 * 4, 6 * 4)]).toEqual([0x22, 0x44, 0x66, 255]);
    expect([...data.subarray(6 * 4, 7 * 4)]).toEqual([0xff, 0xcc, 0x00, 255]);

    const unknown = request({ cid: CID, scale: 'minified' });
    await expect(AtlasSpriteSheetService.definitionRender(unknown.req, unknown.res, {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('reads the density from the render bytes, so an upscaled render derives the same images', async () => {
    const same = request({ cid: UPSCALED_CID, scale: 'upscaled' });
    const upscaled = await AtlasSpriteSheetService.definitionRender(same.req, same.res, {});
    expect(upscaled.buffer.equals(ipfs.get(UPSCALED_RENDER))).toBe(true);

    const fromPrimary = await AtlasSpriteSheetService.idlePreview(request({ key: CID }).req, request({}).res, {});
    const fromUpscaled = await AtlasSpriteSheetService.idlePreview(
      request({ key: UPSCALED_CID }).req,
      request({}).res,
      {},
    );
    expect((await pixels(fromUpscaled.buffer)).data.equals((await pixels(fromPrimary.buffer)).data)).toBe(true);
  });

  it('answers a definition that names no render yet with zero frames, and no still or animation', async () => {
    models.ObjectLayer = { findByCid: () => lean({ cid: CID, data: { render: { cid: '', metadataCid: '' } } }) };
    const counts = request({ cid: CID });
    const { frameCounts } = await AtlasSpriteSheetService.frameCounts(counts.req, counts.res, {});
    expect(Object.values(frameCounts).every((count) => count === 0)).toBe(true);
    const still = request({ key: CID });
    await expect(AtlasSpriteSheetService.idlePreview(still.req, still.res, {})).rejects.toMatchObject({ status: 404 });
    const walk = request({ cid: CID, directionCode: '18' });
    await expect(AtlasSpriteSheetService.animation(walk.req, walk.res, {})).rejects.toMatchObject({ status: 404 });
    const bare = request({ cid: CID });
    await expect(AtlasSpriteSheetService.layout(bare.req, bare.res, {})).rejects.toMatchObject({ status: 404 });
    await expect(AtlasSpriteSheetService.definitionRender(bare.req, bare.res, {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('answers 404 for an unknown definition and 503 when IPFS does not answer', async () => {
    const unknown = request({ cid: 'bafkreiunknown', directionCode: '08' });
    await expect(AtlasSpriteSheetService.animation(unknown.req, unknown.res, {})).rejects.toMatchObject({
      status: 404,
    });

    ipfs.delete(LAYOUT);
    const down = request({ cid: CID });
    await expect(AtlasSpriteSheetService.frameCounts(down.req, down.res, {})).rejects.toMatchObject({ status: 503 });
    ipfs.set(LAYOUT, Buffer.from(JSON.stringify(layout)));
  });
});

describe('the render of an item label', () => {
  const label = (params, extension) => ({ ...request(params), options: extension ? { extension } : {} });
  const primary = Buffer.from('primary-render');

  beforeEach(() => {
    models.AtlasSpriteSheet = {
      findOne: ({ objectLayerCid }) =>
        lean(objectLayerCid === CID ? { fileId: 'f-primary', idlePreviewFileId: null } : null),
    };
    models.File = {
      findById: async (id) => (id === 'f-primary' ? { data: primary, name: 'hatchet-primary.png' } : null),
    };
  });

  it('serves the primary render of the atlas the host binds the label to', async () => {
    const resolveKey = vi.fn(async () => CID);
    const { req, res, headers, options } = label({ itemKey: 'hatchet' }, { resolveKey });
    const answer = await AtlasSpriteSheetService.blob(req, res, options);
    expect(answer.buffer.equals(primary)).toBe(true);
    expect(resolveKey).toHaveBeenCalledWith('hatchet', options);
    // A label can move to another render: the client revalidates its copy by the File id.
    expect(answer.etag).toBe('f-primary');
    expect(headers['Cache-Control']).toBe('public, no-cache');
  });

  it('answers 404 for a label no host binds, and for a derived render the atlas lacks', async () => {
    const unbound = label({ itemKey: 'hatchet' });
    await expect(AtlasSpriteSheetService.blob(unbound.req, unbound.res, unbound.options)).rejects.toMatchObject({
      status: 404,
    });
    const still = label({ key: 'hatchet' }, { resolveKey: async () => CID });
    await expect(AtlasSpriteSheetService.idlePreview(still.req, still.res, still.options)).rejects.toMatchObject({
      status: 404,
    });
  });
});
