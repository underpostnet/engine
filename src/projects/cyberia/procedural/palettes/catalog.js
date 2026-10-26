/**
 * The global palettes of the Procedural Engine. Cyberia content owns them; this module reads them
 * from the content artifact, verifies each one, orders them for a client and picks one for a
 * candidate.
 *
 * A palette is one theme of one library. It belongs to no item type: it gives a color to `primary`
 * and `outline`, and to any other palette role and `accent` the theme needs. Each role of a Genesis
 * Template takes one palette role, so every palette colors every template. It belongs to a family,
 * may name the biomes it suits, and demands a least OKLab distance between its outline and its
 * contrast roles.
 *
 * @module src/projects/cyberia/procedural/palettes/catalog.js
 * @namespace CyberiaProceduralPaletteCatalog
 */
import { hexToRgba } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { contentArtifact } from '../../content/content-artifact.js';
import { oklabDistance, toOklab } from '../core/oklab.js';
import { deriveSeed } from '../core/seed.js';
import { GENERATOR_ROLES, PALETTE_ROLES } from '../templates.js';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const ROLES = Object.freeze([...PALETTE_ROLES, ...GENERATOR_ROLES]);

/**
 * A palette checked: its identity, its family, its colors and the contrast its constraints demand
 * between the outline and the palette roles they name.
 * @param {Object} palette
 * @param {string[]} families - The palette families of the content.
 * @returns {Object} The same palette.
 * @throws {RangeError} When the palette breaks the structure.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function validatePalette(palette, families) {
  const fail = (message) => {
    throw new RangeError(`Palette ${palette?.id}: ${message}`);
  };
  if (typeof palette?.id !== 'string' || !SLUG_PATTERN.test(palette.id)) fail('its id must be a slug');
  if (typeof palette.name !== 'string' || !palette.name) fail('name is required');
  if (!families.includes(palette.family)) fail(`${palette.family} is not a family`);
  if (!Array.isArray(palette.biomeTags) || palette.biomeTags.some((tag) => !SLUG_PATTERN.test(tag)))
    fail('biomeTags must list biome slugs');
  const given = Object.entries(palette.roles ?? {});
  if (
    !palette.roles?.primary ||
    !palette.roles.outline ||
    given.some(([role, color]) => !ROLES.includes(role) || !HEX_COLOR.test(color))
  )
    fail(`roles must give primary and outline, and only ${ROLES.join(', ')}, each a color as #rrggbb`);
  const { minContrast, contrastRoles } = palette.constraints ?? {};
  if (!(Number.isFinite(minContrast) && minContrast >= 0)) fail('constraints.minContrast must be a number');
  if (
    !Array.isArray(contrastRoles) ||
    contrastRoles.length === 0 ||
    contrastRoles.some((role) => !PALETTE_ROLES.includes(role) || !palette.roles[role])
  )
    fail('constraints.contrastRoles must name palette roles the palette gives');
  for (const role of contrastRoles)
    if (oklabDistance(hexToRgba(palette.roles[role]), hexToRgba(palette.roles.outline)) < minContrast)
      fail(`${role} is too close to the outline`);
  return palette;
}

const catalogs = new WeakMap();

/**
 * The palette catalog of the served content: its families in order, and every palette verified, by
 * family, then from the darkest first contrast role to the lightest.
 * @returns {{families:string[],palettes:Object[]}}
 * @throws {RangeError} When a palette breaks the structure.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function paletteCatalog() {
  const { procedural } = contentArtifact();
  if (!catalogs.has(procedural)) {
    const { families, palettes } = procedural;
    const lightness = (palette) => toOklab(hexToRgba(palette.roles[palette.constraints.contrastRoles[0]]))[0];
    const order = (left, right) =>
      families.indexOf(left.family) - families.indexOf(right.family) ||
      lightness(left) - lightness(right) ||
      (left.id < right.id ? -1 : 1);
    catalogs.set(
      procedural,
      Object.freeze({
        families,
        palettes: palettes.map((palette) => validatePalette(palette, families)).sort(order),
      }),
    );
  }
  return catalogs.get(procedural);
}

/**
 * The palette an id names.
 * @param {string} id
 * @returns {Object}
 * @throws {RangeError} When no palette has that id.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function paletteOf(id) {
  const palette = paletteCatalog().palettes.find((entry) => entry.id === id);
  if (!palette) throw new RangeError(`There is no palette ${id}`);
  return palette;
}

/**
 * The palette a candidate takes from a random choice: one palette of the library. The root seed,
 * the item id and the variant decide it, so equal inputs give an equal palette.
 * @param {Object} params
 * @param {number} params.rootSeed
 * @param {string} params.itemId - The item id of the candidate.
 * @param {number} [params.variant] - The variant of an existing item; 0 for the first.
 * @returns {Object}
 * @throws {RangeError} When the content has no palette.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function randomPalette({ rootSeed, itemId, variant = 0 }) {
  const { palettes } = paletteCatalog();
  if (palettes.length === 0) throw new RangeError('The content has no palette');
  return palettes[deriveSeed(rootSeed, itemId, variant, 'palette') % palettes.length];
}
