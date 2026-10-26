/**
 * Palette resolution. A color slot is one tone of one role: `<role>.shadow`, `<role>.base` and
 * `<role>.highlight` for each role of a Genesis Template, then `outline` and `accent`. The palette
 * of a candidate takes, for each role, the color of the palette role it takes in its palette or the
 * colors of the foundation palettes of its item, then the slot colors the moderator sets. The palette plan of a
 * variant resolves the tones of every region: an explicit tone stays; any other role starts from
 * the source render or the template and moves with the seed. A tone left open derives from the
 * base. Colors move in OKLCH. Pure functions.
 *
 * @module src/projects/cyberia/procedural/palettes/resolver.js
 */
import { hexToRgba, rgbaToHex } from '../../../../client/components/objectlayer-studio/RenderSource.js';
import { seededRandom } from '../../../../client/components/objectlayer-studio/PixelRegion.js';
import { fromOklch, toOklab, toOklch } from '../core/oklab.js';
import { operatorSeed } from '../core/seed.js';
import { GENERATOR_ROLES, PALETTE_ROLES, TONES } from '../templates.js';

/** The strongest move of a color the palette variation makes: OKLab lightness, a turn of hue, and a share of chroma. */
const MAX_LIGHTNESS_SHIFT = 0.1;
const MAX_HUE_SHIFT = 0.04;
const MAX_CHROMA_SHIFT = 0.3;
/** The OKLab lightness step between the base tone and its shadow and highlight. */
const TONE_STEP = 0.12;
/** The OKLab lightness of a random accent. */
const ACCENT_LIGHTNESS = 0.75;
/** The hue offsets of the color schemes a random palette takes, in turns of the color wheel. */
const HARMONIES = Object.freeze([
  [0, 1 / 12, -1 / 12],
  [0, 1 / 2],
  [0, 1 / 3, 2 / 3],
  [0, 5 / 12, 7 / 12],
]);

/** `#rrggbb` of a color with its OKLCH lightness, hue and chroma moved; `chroma` is a share of the current chroma. */
export const shiftColor = (hex, { hue = 0, chroma = 0, lightness = 0 } = {}) => {
  const [l, c, h] = toOklch(hexToRgba(hex));
  return rgbaToHex([...fromOklch([l + lightness, c * (1 + chroma), (h + hue + 1) % 1]), 255]).slice(0, 7);
};

/** The shadow, base and highlight tones of a base color. */
export const tonesOf = (base) => ({
  shadow: shiftColor(base, { lightness: -TONE_STEP }),
  base,
  highlight: shiftColor(base, { lightness: TONE_STEP }),
});

/**
 * The color slots of a template: the three tones of each role, then the generator roles.
 * @param {Object} template - A resolved Genesis Template.
 * @returns {Array<{id:string,role:string,tone:string}>}
 */
export const paletteSlots = (template) => [
  ...Object.keys(template.roles).flatMap((role) => TONES.map((tone) => ({ id: `${role}.${tone}`, role, tone }))),
  ...GENERATOR_ROLES.map((role) => ({ id: role, role, tone: 'base' })),
];

/** The color of each slot in a template; the accent has none. */
export const templateSlotColors = (template) => ({
  ...Object.fromEntries(
    Object.entries(template.roles).flatMap(([role, { tones }]) => TONES.map((tone) => [`${role}.${tone}`, tones[tone]])),
  ),
  outline: template.outline,
});

/**
 * A random color for each slot of a template. The roles follow one hue scheme and keep the
 * lightness of the template, so the item reads as the template does: the outline stays dark, the
 * accent stands out, and roles the template colors alike stay alike.
 * @param {Object} template - A resolved Genesis Template.
 * @param {() => number} random - Numbers from 0 to 1.
 * @returns {Object<string,string>} Slot id → `#rrggbb`.
 */
export function randomSlotColors(template, random) {
  const hue = random();
  const offsets = HARMONIES[Math.floor(random() * HARMONIES.length)];
  const color = (lightness, chroma, turn) =>
    rgbaToHex([...fromOklch([lightness, chroma, (turn + 1) % 1]), 255]).slice(0, 7);
  const byBase = new Map();
  const slots = {};
  for (const [role, { tones }] of Object.entries(template.roles)) {
    if (!byBase.has(tones.base)) {
      const [lightness] = toOklch(hexToRgba(tones.base));
      const turn = hue + offsets[byBase.size % offsets.length] + (random() - 0.5) * 0.04;
      byBase.set(tones.base, color(lightness + (random() - 0.5) * 0.16, 0.03 + random() * 0.14, turn));
    }
    for (const [tone, value] of Object.entries(tonesOf(byBase.get(tones.base)))) slots[`${role}.${tone}`] = value;
  }
  slots.outline = color(toOklch(hexToRgba(template.outline))[0], random() * 0.03, hue);
  slots.accent = color(ACCENT_LIGHTNESS, 0.15 + random() * 0.1, hue + 0.5);
  return slots;
}

/**
 * The tone among `colors` on the side of `base` that `side` names (-1 darker, 1 lighter) whose hue
 * stands nearest to it, by the OKLab distance in the chroma plane; undefined when none does.
 */
function nearestTone(base, colors = [], side) {
  const [lightness, a, b] = toOklab(hexToRgba(base));
  let best;
  for (const color of colors) {
    const [l, ca, cb] = toOklab(hexToRgba(color));
    if (Math.sign(l - lightness) !== side) continue;
    const distance = Math.hypot(ca - a, cb - b);
    if (!best || distance < best.distance) best = { color, distance };
  }
  return best?.color;
}

/**
 * The roles the foundation palettes of an item color in a template. Each base color of the
 * palettes, in their order, colors the next role the template marks for art direction, with the
 * shadow and the highlight of its palette nearest in hue. The first outline colors the outline; the
 * first accent, else the first special color, colors the accent. A role no palette reaches stays open.
 * @param {Object} template - A resolved Genesis Template.
 * @param {Array<{roles:Object<string,string[]>}>} [palettes] - The `palettes` of an art direction.
 * @returns {Object<string,{base:string,shadow?:string,highlight?:string}>} Role → tones.
 */
export function foundationRoles(template, palettes = []) {
  const toneSets = palettes.flatMap(({ roles }) =>
    (roles.base ?? []).map((base) => ({
      base,
      shadow: nearestTone(base, roles.shadow, -1),
      highlight: nearestTone(base, roles.highlight, 1),
    })),
  );
  const artRoles = Object.keys(template.roles).filter((role) => template.roles[role].artDirection);
  const first = (...names) =>
    names.map((name) => palettes.map(({ roles }) => roles[name]?.[0]).find(Boolean)).find(Boolean);
  const roles = {};
  artRoles.slice(0, toneSets.length).forEach((role, at) => {
    roles[role] = Object.fromEntries(Object.entries(toneSets[at]).filter(([, color]) => color));
  });
  const outline = first('outline');
  const accent = first('accent', 'special');
  if (outline) roles.outline = { base: outline };
  if (accent) roles.accent = { base: accent };
  return roles;
}

/**
 * The color a palette gives the roles of a template: each role takes the color of its palette role,
 * then `outline` and `accent`. A role whose palette role the palette does not give is left out.
 * @param {Object} template - A resolved Genesis Template.
 * @param {Object} palette - A palette.
 * @returns {Object<string,string>} Role → `#rrggbb`.
 */
export const paletteRoles = (template, palette) =>
  Object.fromEntries(
    [
      ...Object.entries(template.roles).map(([role, { palette: taken }]) => [role, palette.roles[taken]]),
      ...GENERATOR_ROLES.map((role) => [role, palette.roles[role]]),
    ].filter(([, color]) => color),
  );

/**
 * The roles a remap of imported frames reads from the colors of a palette: its outline, its colors as
 * the base of one lightness ramp, and its accent. A role with no color is left out.
 * @param {{roles:Object<string,string>}} palette - A palette, or the colors of an import by slot.
 * @returns {Object<string,string[]>} Role → `#rrggbb` colors.
 */
export const rampRoles = ({ roles }) => ({
  ...(roles.outline && { outline: [roles.outline] }),
  base: PALETTE_ROLES.map((role) => roles[role]).filter(Boolean),
  ...(roles.accent && { accent: [roles.accent] }),
});

/**
 * The palette of a candidate: the roles its palette or the foundation palettes of its item color,
 * under the slot colors the request sets.
 * @param {Object} template - A resolved Genesis Template.
 * @param {Object} [params]
 * @param {Object|null} [params.palette] - A palette.
 * @param {Object<string,string>} [params.slots] - Slot id → `#rrggbb`; see {@link paletteSlots}.
 * @param {Object|null} [params.artDirection] - The art direction of the source item.
 * @returns {Readonly<{roles:Object<string,Object<string,string>>}>}
 * @throws {RangeError} When a slot is not a slot of the template.
 */
export function candidatePalette(template, { palette = null, slots = {}, artDirection = null } = {}) {
  const known = new Map(paletteSlots(template).map((slot) => [slot.id, slot]));
  const unknown = Object.keys(slots).filter((id) => !known.has(id));
  if (unknown.length > 0)
    throw new RangeError(`Genesis Template ${template.id} has no color slot ${unknown.join(', ')}`);
  const roles = {
    ...foundationRoles(template, artDirection?.palettes),
    ...Object.fromEntries(
      Object.entries(palette ? paletteRoles(template, palette) : {}).map(([role, base]) => [role, { base }]),
    ),
  };
  for (const [id, color] of Object.entries(slots)) {
    const { role, tone } = known.get(id);
    roles[role] = { ...roles[role], [tone]: color };
  }
  return Object.freeze({ roles });
}

/**
 * The palette plan of a variant.
 * @param {Object} params
 * @param {Object} params.template - A resolved Genesis Template.
 * @param {{roles:Object}} params.palette - {@link candidatePalette}.
 * @param {Object<string,string>} [params.sourceBase] - The dominant `#rrggbb` color of each role in the source render.
 * @param {number} params.seed - The seed of the variant.
 * @param {number} params.variation - The palette variation, 0 to 1.
 * @returns {{outline:string,accent:string,regions:Object<string,{shadow:string,base:string,highlight:string}>}}
 */
export function planPalette({ template, palette, sourceBase = {}, seed, variation }) {
  const random = seededRandom(operatorSeed(seed, { operatorId: 'palette-plan' }));
  const regions = {};
  let first = null;
  for (const [role, { tones, regions: roleRegions }] of Object.entries(template.roles)) {
    const explicit = palette.roles[role] ?? {};
    const start = explicit.base ?? sourceBase[role] ?? tones.base;
    const base = explicit.base
      ? start
      : shiftColor(start, {
          hue: (random() - 0.5) * 2 * MAX_HUE_SHIFT * variation,
          chroma: (random() - 0.5) * 2 * MAX_CHROMA_SHIFT * variation,
          lightness: (random() - 0.5) * 2 * MAX_LIGHTNESS_SHIFT * variation,
        });
    const derived = base === tones.base ? tones : tonesOf(base);
    const planned = {
      shadow: explicit.shadow ?? derived.shadow,
      base,
      highlight: explicit.highlight ?? derived.highlight,
    };
    first ??= planned;
    for (const region of roleRegions) regions[region] = planned;
  }
  return {
    outline: palette.roles.outline?.base ?? template.outline,
    accent: palette.roles.accent?.base ?? first.highlight,
    regions,
  };
}

/**
 * The color each slot of a template starts from, and where it comes from: `palette` for a role the
 * palette colors, `foundation` for a role the foundation palettes color, which both stay as they
 * are; `render` or `template` for the others, which move with the palette variation.
 * @param {Object} params
 * @param {Object} params.template - A resolved Genesis Template.
 * @param {Object|null} [params.palette] - A palette.
 * @param {Object|null} [params.artDirection] - The art direction of the source item.
 * @param {Object<string,string>} [params.sourceBase] - The dominant color of each role in the source render.
 * @returns {Object<string,{color:string,origin:'palette'|'foundation'|'render'|'template'}>} Slot id → its default.
 */
export function slotDefaults({ template, palette = null, artDirection = null, sourceBase = {} }) {
  const plan = planPalette({
    template,
    palette: candidatePalette(template, { palette, artDirection }),
    sourceBase,
    seed: 0,
    variation: 0,
  });
  const foundation = foundationRoles(template, artDirection?.palettes);
  const colored = palette ? paletteRoles(template, palette) : {};
  const originOf = (role) =>
    colored[role] ? 'palette' : foundation[role] ? 'foundation' : sourceBase[role] ? 'render' : 'template';
  const [firstRole] = Object.keys(template.roles);
  const defaults = {};
  for (const { id, role, tone } of paletteSlots(template)) {
    if (role === 'outline') defaults[id] = { color: plan.outline, origin: originOf(role) };
    else if (role === 'accent') {
      const origin = originOf(role);
      defaults[id] = { color: plan.accent, origin: origin === 'template' ? originOf(firstRole) : origin };
    } else defaults[id] = { color: plan.regions[template.roles[role].regions[0]][tone], origin: originOf(role) };
  }
  return defaults;
}
