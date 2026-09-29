/**
 * Pixel templates: editor tooling that starts a frame, never content. A template states the
 * palette role of each cell, or its color. Painting a role template with a palette gives a frame in
 * that palette, so one shape serves every biome.
 *
 * @typedef {Object} PixelTemplate
 * @property {string} id
 * @property {string} label
 * @property {string[]} itemTypes - Item types it suits; empty suits every type.
 * @property {string[]} [kinds] - Content kinds it suits, such as `tree`, where one type holds several.
 * @property {(string|null)[][]} [roles] - Palette role of each cell; null leaves the cell empty.
 * @property {(string|null)[][]} [colors] - `#rrggbb` color of each cell; null leaves the cell empty.
 * @property {''|'x'|'y'|'xy'} [symmetry] - The mirror the shape keeps, for painting over it.
 *
 * @module src/client/components/objectlayer-studio/PixelTemplate.js
 */
import { hexToRgba } from './RenderSource.js';

/** The color a role takes when a palette names no color for it or for `base`. */
const NEUTRAL = '#808080';

/**
 * The frame a template paints. A role cell takes a color of its role; cells of one role alternate
 * between the role's colors, so a surface reads as texture.
 * @param {PixelTemplate} template
 * @param {Object<string,string[]>} [palette] - `#rrggbb` colors by role.
 * @returns {number[][][]} rgba frame.
 */
export function renderTemplate(template, palette = {}) {
  const colorOf = (role, x, y) => {
    const colors = palette[role]?.length ? palette[role] : palette.base?.length ? palette.base : [NEUTRAL];
    return colors[(x * 7 + y * 13) % colors.length];
  };
  const cells = template.roles ?? template.colors;
  return cells.map((row, y) =>
    row.map((cell, x) => (cell === null ? [0, 0, 0, 0] : hexToRgba(template.roles ? colorOf(cell, x, y) : cell))),
  );
}

/** Whether a template suits an item type, and a content kind when one is known. */
export const templateSuits = (template, itemType, kind = '') =>
  (template.itemTypes.length === 0 || template.itemTypes.includes(itemType)) &&
  (!template.kinds || !kind || template.kinds.includes(kind));
