/**
 * The editor source of an Object Layer render: indexed pixel frames and their palette.
 *
 * A source is `{ format, width, height, palette, frameDurationMs, frames }`. `palette` holds
 * `#rrggbbaa` colors. `frames` maps each render keyframe to its frames; a frame is a `Uint8Array`
 * of palette indexes, row by row. The wire form, for JSON and backups, carries each frame as base64
 * text. Pure functions: no DOM and no storage, so the editor and the server share them.
 *
 * @module src/client/components/objectlayer-studio/RenderSource.js
 */

/** The one pixel format: one byte per pixel, an index into the palette. */
export const RENDER_SOURCE_FORMAT = 'indexed8';

/** Colors one index byte can address. */
export const RENDER_SOURCE_MAX_COLORS = 256;

const HEX_PATTERN = /^#[0-9a-f]{8}$/;

/** `[r, g, b, a]` as `#rrggbbaa`. */
export const rgbaToHex = (rgba) => `#${rgba.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

/** `#rrggbbaa` (or `#rrggbb`, opaque) as `[r, g, b, a]`. */
export const hexToRgba = (hex) => {
  const digits = hex.length === 7 ? `${hex.slice(1)}ff` : hex.slice(1);
  return [0, 2, 4, 6].map((offset) => parseInt(digits.slice(offset, offset + 2), 16));
};

/** Whether a value is a render source in wire form. */
export const isRenderSource = (value) => value?.format === RENDER_SOURCE_FORMAT;

/**
 * A source from frames of palette indexes: every frame keeps the size of the first one.
 * @param {Object} params
 * @param {Object<string,number[][][]>} params.frames - Keyframe → frames of index rows.
 * @param {string[]} params.palette - `#rrggbbaa` colors.
 * @param {number} params.frameDurationMs
 * @returns {Object} The source.
 * @throws {RangeError} When the palette exceeds one byte, or frames differ in size.
 */
function sourceOf({ frames, palette, frameDurationMs }) {
  if (palette.length > RENDER_SOURCE_MAX_COLORS)
    throw new RangeError(`A render holds at most ${RENDER_SOURCE_MAX_COLORS} colors, not ${palette.length}`);
  const first = Object.values(frames).find((list) => list.length > 0)?.[0] ?? [];
  const height = first.length;
  const width = first[0]?.length ?? 0;
  const packed = {};
  for (const [keyframe, list] of Object.entries(frames)) {
    if (list.length === 0) continue;
    packed[keyframe] = list.map((rows) => {
      if (rows.length !== height || rows.some((row) => row.length !== width))
        throw new RangeError(`Every frame of a render is ${width}×${height}; a ${keyframe} frame is not`);
      return Uint8Array.from(rows.flat());
    });
  }
  return { format: RENDER_SOURCE_FORMAT, width, height, palette, frameDurationMs, frames: packed };
}

/**
 * A source from frames of rgba cells, the form the editor paints. Colors enter the palette in
 * first-seen order.
 * @param {Object} params
 * @param {Object<string,number[][][][]>} params.frames - Keyframe → frames of `[r, g, b, a]` rows.
 * @param {number} params.frameDurationMs
 * @returns {Object}
 */
export function sourceFromRgbaFrames({ frames, frameDurationMs }) {
  const palette = [];
  const indexOf = new Map();
  const indexed = {};
  for (const [keyframe, list] of Object.entries(frames))
    indexed[keyframe] = list.map((rows) =>
      rows.map((row) =>
        row.map((rgba) => {
          const hex = rgbaToHex(rgba);
          if (!indexOf.has(hex)) indexOf.set(hex, palette.push(hex) - 1);
          return indexOf.get(hex);
        }),
      ),
    );
  return sourceOf({ frames: indexed, palette, frameDurationMs });
}

/**
 * A source from frames of palette indexes and an rgba palette, the form image decoding yields.
 * @param {Object} params
 * @param {Object<string,number[][][]>} params.frames
 * @param {number[][]} params.colors - `[r, g, b, a]` palette.
 * @param {number} params.frameDurationMs
 * @returns {Object}
 */
export const sourceFromIndexedFrames = ({ frames, colors, frameDurationMs }) =>
  sourceOf({ frames, palette: colors.map(rgbaToHex), frameDurationMs });

/**
 * The rgba rows of one frame of a source.
 * @param {Object} source
 * @param {Uint8Array} pixels
 * @returns {number[][][]}
 */
export function rgbaFrame(source, pixels) {
  const colors = source.palette.map(hexToRgba);
  return Array.from({ length: source.height }, (_, y) =>
    Array.from({ length: source.width }, (_, x) => colors[pixels[y * source.width + x]].slice()),
  );
}

const toBase64 = (bytes) => {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
};

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/**
 * The wire form of a source: the same fields in one order, keyframes sorted, each frame as base64 text.
 * @param {Object} source
 * @returns {Object}
 */
export const toWire = ({ format, width, height, palette, frameDurationMs, frames }) => ({
  format,
  width,
  height,
  palette,
  frameDurationMs,
  frames: Object.fromEntries(
    Object.keys(frames)
      .sort()
      .map((keyframe) => [keyframe, frames[keyframe].map(toBase64)]),
  ),
});

/**
 * A source from its wire form, checked: a known format, a palette of `#rrggbbaa` colors, frames of
 * `width × height` indexes that name palette colors.
 * @param {Object} wire
 * @returns {Object}
 * @throws {TypeError} When the wire form is not a valid source.
 */
export function fromWire(wire) {
  if (!isRenderSource(wire)) throw new TypeError(`A render source has format ${RENDER_SOURCE_FORMAT}`);
  const { width, height, palette, frameDurationMs } = wire;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0)
    throw new TypeError('A render source has an integer width and height');
  if (
    !Array.isArray(palette) ||
    palette.length > RENDER_SOURCE_MAX_COLORS ||
    !palette.every((hex) => HEX_PATTERN.test(hex))
  )
    throw new TypeError(`A render source palette holds up to ${RENDER_SOURCE_MAX_COLORS} #rrggbbaa colors`);
  if (!Number.isFinite(frameDurationMs) || frameDurationMs < 0)
    throw new TypeError('A render source has a frame duration in milliseconds');
  const frames = {};
  for (const [keyframe, list] of Object.entries(wire.frames ?? {})) {
    frames[keyframe] = list.map((text) => {
      const pixels = fromBase64(text);
      if (pixels.length !== width * height || pixels.some((index) => index >= palette.length))
        throw new TypeError(`A ${keyframe} frame is not ${width}×${height} palette indexes`);
      return pixels;
    });
  }
  return { format: RENDER_SOURCE_FORMAT, width, height, palette: [...palette], frameDurationMs, frames };
}

/** Whether two sources hold the same render. */
export const sameSource = (left, right) => JSON.stringify(toWire(left)) === JSON.stringify(toWire(right));
