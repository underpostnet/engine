import { describe, it, expect } from 'vitest';
import { AtlasSpriteSheetGenerator } from '../../../src/api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { objectLayerIdentity, renderContractOf } from '../../../src/api/object-layer/object-layer.identity.js';

// The render contract is part of the canonical content: the same frames give the same bytes, so
// the same contract and the same identity. Other frames give another contract, so another identity.
const frame = (value) => [
  [0, value, 0],
  [value, 1, value],
  [0, value, 0],
];

const renderFrames = {
  frames: { down_idle: [frame(1), frame(2)], up_idle: [frame(3)], left_walking: [frame(2), frame(1)] },
  colors: [
    [0, 0, 0, 0],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
  ],
  frame_duration: 120,
};

const definition = (render) => ({
  profile: { id: 'cyberia', version: 2 },
  data: { item: { id: 'hatchet', type: 'weapon' }, stats: { effect: 1 }, render },
});

describe('atlas generation determinism', () => {
  it('produces identical bytes and layout for identical render frames', async () => {
    const first = await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20);
    const second = await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20);

    expect(second.metadata).toEqual(first.metadata);
    expect(second.primary.equals(first.primary)).toBe(true);
    expect(renderContractOf(second)).toEqual(renderContractOf(first));
  });

  it('keeps the Object Layer identity of a rebuilt render', async () => {
    const first = renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20));
    const rebuilt = renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20));

    expect(objectLayerIdentity(definition(rebuilt))).toEqual(objectLayerIdentity(definition(first)));
  });

  it('gives a changed render a new definition identity', async () => {
    const first = renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20));
    const changed = renderContractOf(
      await AtlasSpriteSheetGenerator.generateAtlas(
        { ...renderFrames, frames: { ...renderFrames.frames, up_idle: [frame(2)] } },
        'hatchet',
        20,
      ),
    );

    expect(changed.cid).not.toBe(first.cid);
    expect(changed.metadataCid).toBe(first.metadataCid);
    expect(objectLayerIdentity(definition(changed)).cid).not.toBe(objectLayerIdentity(definition(first)).cid);
  });

  it('records the upscale factor in the layout, so the factor is part of the contract', async () => {
    const at20 = renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 20));
    const at10 = renderContractOf(await AtlasSpriteSheetGenerator.generateAtlas(renderFrames, 'hatchet', 10));

    expect(at10.cid).toBe(at20.cid);
    expect(at10.metadataCid).not.toBe(at20.metadataCid);
  });
});
