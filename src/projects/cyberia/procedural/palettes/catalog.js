/**
 * The Palette Templates of the Procedural Engine. Cyberia content owns them; this module reads them
 * from the content artifact, verifies each one, orders them for a client and picks one for a
 * candidate.
 *
 * A Palette Template gives a base color to roles of its item type: the roles of a Genesis Template,
 * `outline` and `accent`. It belongs to a family, may name the biomes it suits, and demands a least
 * OKLab distance between its outline and its contrast roles.
 *
 * @module src/projects/cyberia/procedural/palettes/catalog.js
 * @namespace CyberiaProceduralPaletteCatalog
 */
import { hexToRgba } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { contentArtifact } from '../../content/content-artifact.js';
import { oklabDistance, toOklab } from '../core/oklab.js';
import { deriveSeed } from '../core/seed.js';
import { GENERATOR_ROLES } from '../templates.js';

const ID_PATTERN = /^[a-z][a-z0-9]*\.[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;

/**
 * A Palette Template checked: its identity, its family, its colors and the contrast its constraints
 * demand between the outline and the roles they name.
 * @param {Object} palette
 * @param {string[]} families - The palette families of the content.
 * @returns {Object} The same palette.
 * @throws {RangeError} When the palette breaks the structure.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function validatePaletteTemplate(palette, families) {
  const fail = (message) => {
    throw new RangeError(`Palette ${palette?.id}: ${message}`);
  };
  if (typeof palette?.id !== 'string' || !ID_PATTERN.test(palette.id) || !palette.id.startsWith(`${palette.itemType}.`))
    fail('its id must be <itemType>.<slug>');
  if (typeof palette.name !== 'string' || !palette.name) fail('name is required');
  if (!families.includes(palette.family)) fail(`${palette.family} is not a family`);
  if (!Array.isArray(palette.biomeTags) || palette.biomeTags.some((tag) => !SLUG_PATTERN.test(tag)))
    fail('biomeTags must list biome slugs');
  const roles = Object.entries(palette.roles ?? {});
  if (roles.length === 0 || roles.some(([, color]) => !HEX_COLOR.test(color)))
    fail('roles must give each role a color as #rrggbb');
  if (!palette.roles.outline) fail('roles needs an outline');
  const { minContrast, contrastRoles } = palette.constraints ?? {};
  if (!(Number.isFinite(minContrast) && minContrast >= 0)) fail('constraints.minContrast must be a number');
  if (!Array.isArray(contrastRoles) || contrastRoles.length === 0 || contrastRoles.some((role) => !palette.roles[role]))
    fail('constraints.contrastRoles must name roles of the palette');
  for (const role of contrastRoles)
    if (oklabDistance(hexToRgba(palette.roles[role]), hexToRgba(palette.roles.outline)) < minContrast)
      fail(`${role} is too close to the outline`);
  return palette;
}

const catalogs = new WeakMap();

/**
 * The palette catalog of the served content: its families in order, and every Palette Template
 * verified, by family, then from the darkest first contrast role to the lightest.
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
        palettes: palettes.map((palette) => validatePaletteTemplate(palette, families)).sort(order),
      }),
    );
  }
  return catalogs.get(procedural);
}

/**
 * The Palette Templates that fit a Genesis Template: of its item type, naming only its roles and the
 * generator roles.
 * @param {Object} template - A resolved Genesis Template.
 * @returns {Object[]}
 * @memberof CyberiaProceduralPaletteCatalog
 */
export const palettesFor = (template) =>
  paletteCatalog().palettes.filter(
    (palette) =>
      palette.itemType === template.itemType &&
      Object.keys(palette.roles).every((role) => GENERATOR_ROLES.includes(role) || template.roles[role]),
  );

/**
 * The palette a candidate takes from a random choice: one of the palettes that fit its template.
 * The root seed, the item id and the variant decide it, so equal inputs give an equal palette.
 * @param {Object} params
 * @param {Object} params.template - A resolved Genesis Template.
 * @param {number} params.rootSeed
 * @param {string} params.itemId - The item id of the candidate.
 * @param {number} [params.variant] - The variant of an existing item; 0 for the first.
 * @returns {Object}
 * @throws {RangeError} When no palette fits the template.
 * @memberof CyberiaProceduralPaletteCatalog
 */
export function randomPalette({ template, rootSeed, itemId, variant = 0 }) {
  const fitting = palettesFor(template);
  if (fitting.length === 0) throw new RangeError(`No palette fits Genesis Template ${template.id}`);
  return fitting[deriveSeed(rootSeed, itemId, variant, 'palette') % fitting.length];
}
