/**
 * The generation spec of the Procedural Engine: the one place that checks a request and turns it
 * into the spec a job stores.
 *
 * A request names one of two modes. `update-existing` mutates existing Cyberia items: each target
 * keeps its item id, its description and its function, and the run adds candidate revisions for it
 * from the first Genesis Template of its item type that fits it. `create-new` has no source: it
 * starts from a Genesis Template, takes its function from the baseline item of its type, and
 * proposes new item ids. The spec holds the generator, the profile, every template, source, palette
 * and seed in full, so the job it creates never changes and needs no later content.
 *
 * @module src/projects/cyberia/procedural/spec.js
 * @namespace CyberiaProceduralSpec
 */
import { randomInt } from 'node:crypto';
import { sourceFromDirectionFrames, toWire } from '../../../client/components/objectlayer-studio/RenderSource.js';
import { seededRandom } from '../../../client/components/objectlayer-studio/PixelRegion.js';
import { ORIGINS, generationSource, resolveProceduralContext } from './context.js';
import { requestError } from './engine.js';
import { GENERATORS, resolveGenerator } from './generator-registry.js';
import { paletteCatalog, paletteOf, randomPalette } from './palettes/catalog.js';
import {
  candidatePalette,
  paletteSlots,
  rampRoles,
  randomSlotColors,
  slotDefaults,
  templateSlotColors,
} from './palettes/resolver.js';
import { contentFreshness } from '../content/content-artifact.js';
import { RENDER_FRAME_CONTRACT } from '../../../client/components/cyberia/SharedDefaultsCyberia.js';
import { artDirectionOf, baselineSource, itemBaseline, loadItemSource } from './source.js';
import {
  GENERATOR_ROLES,
  PALETTE_ROLES,
  compatibilityProblems,
  genesisTemplate,
  genesisTemplates,
  resolveTemplate,
  templateProblems,
} from './templates.js';

/** The most candidates one job holds. */
export const MAX_JOB_ITEMS = 200;

/** The modes of a generation. */
export const GENERATION_MODES = Object.freeze(['update-existing', 'create-new']);

/**
 * The `paletteId` of a palette choice that gives each candidate a palette the seed picks.
 * @memberof CyberiaProceduralSpec
 */
export const RANDOM_PALETTE = 'random';

const SEED_LIMIT = 2 ** 32;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** An item id, or the prefix of the item ids a create proposes: lowercase words joined by hyphens. */
export const ITEM_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUEST_KEYS = Object.freeze({
  'update-existing': [
    'mode',
    'generator',
    'source',
    'template',
    'palette',
    'output',
    'variation',
    'seed',
    'parameters',
  ],
  'create-new': ['mode', 'generator', 'itemType', 'template', 'palette', 'output', 'variation', 'seed', 'parameters'],
});

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const only = (value, keys, name) => {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw requestError(`${name} does not take ${unknown.join(', ')}`);
  return value;
};

const countOf = (value, name) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_JOB_ITEMS)
    throw requestError(`${name} must be an integer from 1 to ${MAX_JOB_ITEMS}`);
  return value;
};

const isIdList = (ids) =>
  Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id) && new Set(ids).size === ids.length;

/**
 * The target item ids of an update request, existing items each once, and those of them whose
 * candidates start from the Genesis Template instead of their render.
 */
const sourceOf = (source) => {
  if (!isPlain(source) || !Array.isArray(source.itemIds) || source.itemIds.length === 0)
    throw requestError('An update needs source.itemIds with at least one existing item');
  only(source, ['itemIds', 'fromTemplate'], 'source');
  if (!isIdList(source.itemIds)) throw requestError('source.itemIds must list each item id once');
  const fromTemplate = source.fromTemplate ?? [];
  if (!isIdList(fromTemplate) || fromTemplate.some((id) => !source.itemIds.includes(id)))
    throw requestError('source.fromTemplate lists items of source.itemIds, each once');
  return { itemIds: source.itemIds, fromTemplate };
};

/** The new item ids of a create: the ids it names, or the prefix and the count it proposes them from. */
const proposedOf = (output) => {
  if (output.itemIds !== undefined) {
    only(output, ['itemIds'], 'output');
    if (!isIdList(output.itemIds) || output.itemIds.length === 0 || output.itemIds.length > MAX_JOB_ITEMS)
      throw requestError(`output.itemIds lists from 1 to ${MAX_JOB_ITEMS} new item ids, each once`);
    if (output.itemIds.some((id) => !ITEM_ID_PATTERN.test(id)))
      throw requestError('output.itemIds must be lowercase words joined by hyphens');
    return { itemIds: output.itemIds };
  }
  only(output, ['variants', 'itemIdPrefix'], 'output');
  if (typeof output.itemIdPrefix !== 'string' || !ITEM_ID_PATTERN.test(output.itemIdPrefix))
    throw requestError('output.itemIdPrefix must be lowercase words joined by hyphens');
  return { variants: countOf(output.variants, 'output.variants'), itemIdPrefix: output.itemIdPrefix };
};

const refOf = (ref, name) => {
  if (ref === undefined) return null;
  if (!isPlain(ref) || typeof ref.id !== 'string' || !ref.id) throw requestError(`${name} needs an id`);
  only(ref, ['id'], name);
  return ref;
};

/**
 * A palette choice checked: `paletteId`, a palette of the library or {@link RANDOM_PALETTE}, and the
 * `slots` it sets, slot id → `#rrggbb` in lower case.
 * @param {Object} choice
 * @param {string} name - The name of the choice, for the messages.
 * @param {string[]} [keys] - The other keys the choice may hold.
 * @returns {{paletteId?:string,slots:Object<string,string>}}
 * @throws {Error} 400 on a key it does not take or a value that is not a color.
 * @memberof CyberiaProceduralSpec
 */
export const choiceOf = (choice, name, keys = []) => {
  if (!isPlain(choice)) throw requestError(`${name} must be an object`);
  only(choice, [...keys, 'paletteId', 'slots'], name);
  const { paletteId, slots = {} } = choice;
  if (paletteId !== undefined && (typeof paletteId !== 'string' || !paletteId))
    throw requestError(`${name}.paletteId names a palette or ${RANDOM_PALETTE}`);
  if (!isPlain(slots) || Object.values(slots).some((color) => typeof color !== 'string' || !HEX_COLOR.test(color)))
    throw requestError(`${name}.slots maps a slot id to a color as #rrggbb`);
  return {
    ...(paletteId && { paletteId }),
    slots: Object.fromEntries(Object.entries(slots).map(([id, color]) => [id, color.toLowerCase()])),
  };
};

const chooses = ({ paletteId, slots }) => Boolean(paletteId) || Object.keys(slots).length > 0;

/** The palette choice of each item of an update, in the order of the items, without empty ones. */
const itemChoicesOf = (palette = {}, itemIds) => {
  if (!isPlain(palette)) throw requestError('palette must be an object');
  only(palette, ['items'], 'palette');
  const items = palette.items ?? [];
  if (!Array.isArray(items))
    throw requestError('palette.items lists { itemId, paletteId, slots } for items of source.itemIds');
  const byItemId = new Map();
  for (const entry of items) {
    const choice = choiceOf(entry, 'a palette item', ['itemId']);
    if (!itemIds.includes(entry.itemId) || byItemId.has(entry.itemId))
      throw requestError('palette.items names each item of source.itemIds once at most');
    byItemId.set(entry.itemId, choice);
  }
  return {
    items: itemIds
      .filter((itemId) => byItemId.has(itemId) && chooses(byItemId.get(itemId)))
      .map((itemId) => ({ itemId, ...byItemId.get(itemId) })),
  };
};

/**
 * A seed checked: `{ mode: 'fixed', value }` as it is, and `{ mode: 'auto' }` with a new value drawn once.
 * @param {Object} [seed]
 * @returns {{mode:string,value:number}}
 * @throws {Error} 400 on any other seed.
 * @memberof CyberiaProceduralSpec
 */
export const seedOf = (seed = { mode: 'auto' }) => {
  if (!isPlain(seed)) throw requestError('seed must be an object');
  only(seed, ['mode', 'value'], 'seed');
  if (seed.mode === 'auto' && seed.value === undefined) return { mode: 'auto', value: randomInt(SEED_LIMIT) };
  if (seed.mode === 'fixed' && Number.isInteger(seed.value) && seed.value >= 0 && seed.value < SEED_LIMIT)
    return { mode: 'fixed', value: seed.value };
  throw requestError('seed is { mode: "auto" } or { mode: "fixed", value } with an integer from 0 to 2^32 - 1');
};

/**
 * The request checked against its mode: the fields the mode takes, with no other, and every default
 * resolved that needs no stored data. Pure. A new seed is drawn here, once, for an `auto` seed.
 * @param {Object} request
 * @returns {Object} The checked request.
 * @throws {Error} 400 on anything the mode does not take, or a value out of bounds.
 * @memberof CyberiaProceduralSpec
 */
export function checkRequest(request) {
  if (!isPlain(request)) throw requestError('The request must be an object');
  const { mode } = request;
  if (!GENERATION_MODES.includes(mode)) throw requestError(`mode must be ${GENERATION_MODES.join(' or ')}`);
  only(request, REQUEST_KEYS[mode], `A ${mode} request`);
  const output = request.output;
  if (!isPlain(output)) throw requestError('A request needs an output');
  const parameters = request.parameters ?? {};
  if (!isPlain(parameters)) throw requestError('parameters must be an object');
  if (parameters.variation !== undefined) throw requestError('Set the variation in variation.level');
  const variation = request.variation ?? {};
  if (!isPlain(variation)) throw requestError('variation must be an object');
  only(variation, ['level'], 'variation');
  const common = {
    mode,
    generator: refOf(request.generator, 'generator'),
    level: variation.level,
    seed: seedOf(request.seed),
    parameters,
  };
  if (mode === 'update-existing') {
    only(output, ['variantsPerItem'], 'output');
    const { itemIds, fromTemplate } = sourceOf(request.source);
    return {
      ...common,
      palette: itemChoicesOf(request.palette, itemIds),
      template: refOf(request.template, 'template'),
      itemIds,
      fromTemplate,
      variants: countOf(output.variantsPerItem, 'output.variantsPerItem'),
    };
  }
  if (typeof request.itemType !== 'string' || !request.itemType) throw requestError('A create needs an itemType');
  return {
    ...common,
    palette: choiceOf(request.palette ?? {}, 'palette'),
    itemType: request.itemType,
    template: refOf(request.template, 'template'),
    ...proposedOf(output),
  };
}

/**
 * The Genesis Template a spec holds under an id, resolved.
 * @param {Object} spec
 * @param {string} id
 * @returns {Object}
 * @memberof CyberiaProceduralSpec
 */
export const specTemplate = (spec, id) => resolveTemplate(spec.templates.find((template) => template.id === id));

/**
 * The palette a spec holds under an id; null for no id.
 * @param {Object} spec
 * @param {string} id
 * @returns {Object|null}
 * @memberof CyberiaProceduralSpec
 */
export const specPalette = (spec, id) => (id ? spec.palettes.find((palette) => palette.id === id) : null);

/**
 * The palette choice a spec makes for the candidates of a target item: the choice of that item in
 * an update, the choice of the run in a create.
 * @param {{mode:string,palette:Object}} spec - A spec, or a checked request.
 * @param {string} itemId - The target item id.
 * @returns {{paletteId?:string,slots:Object<string,string>}}
 * @memberof CyberiaProceduralSpec
 */
export const specChoice = ({ mode, palette }, itemId) =>
  mode === 'update-existing' ? (palette.items.find((entry) => entry.itemId === itemId) ?? { slots: {} }) : palette;

/** The item id of a proposed item: the prefix and a number of at least three digits. */
export const proposedItemId = (prefix, ordinal) => `${prefix}-${String(ordinal + 1).padStart(3, '0')}`;

/**
 * The Genesis Templates of an item type that serve a profile, resolved.
 * @param {string} itemType
 * @param {Object} profile - A validated profile.
 * @returns {Object[]}
 * @memberof CyberiaProceduralSpec
 */
export const usableTemplates = (itemType, profile) =>
  genesisTemplates()
    .filter((template) => template.itemType === itemType)
    .map(resolveTemplate)
    .filter((template) => templateProblems(template, profile).length === 0);

/** The template a create names, or the first usable one of its item type. */
function createTemplate(input, profile) {
  if (!input.template) {
    const [first] = usableTemplates(input.itemType, profile);
    if (!first) throw new RangeError(`There is no ${input.itemType} Genesis Template for profile ${profile.profileId}`);
    return first;
  }
  const template = resolveTemplate(genesisTemplate(input.template.id));
  const problems = templateProblems(template, profile);
  if (problems.length > 0) throw new RangeError(`Genesis Template ${template.id}: ${problems.join('; ')}`);
  return template;
}

/**
 * Where the candidates of a source start: its render, unless it has none or the request names it
 * among the items that start from the template.
 * @param {{renderSource:Object|null}} source
 * @param {boolean} [fromTemplate]
 * @returns {string} One of {@link ORIGINS}.
 * @memberof CyberiaProceduralSpec
 */
export const originOf = (source, fromTemplate = false) =>
  fromTemplate || !source.renderSource ? 'template' : 'render';

/**
 * The first usable template of the item type of a source that fits what its candidates start from.
 * @param {Object} source - {@link loadItemSource}.
 * @param {Object} profile - A validated profile.
 * @param {string} origin - One of {@link ORIGINS}.
 * @returns {Object} A resolved Genesis Template.
 * @throws {RangeError} When no template fits.
 * @memberof CyberiaProceduralSpec
 */
export function sourceTemplate(source, profile, origin) {
  const { renderSource } = generationSource(source, origin);
  const { type, id } = source.data.item;
  const checked = usableTemplates(type, profile).map((template) => ({
    template,
    problems: compatibilityProblems(template, renderSource, type),
  }));
  const fits = checked.find(({ problems }) => problems.length === 0);
  if (!fits)
    throw new RangeError(
      `No ${type} Genesis Template fits item ${id}${checked.length > 0 ? `: ${checked[0].problems.join('; ')}` : ''}`,
    );
  return fits.template;
}

/**
 * The template a source takes for an origin: the one `templateId` names when it fits, else the first
 * usable template of its item type that fits.
 * @param {Object} source - {@link loadItemSource}.
 * @param {Object} profile - A validated profile.
 * @param {string} origin - One of {@link ORIGINS}.
 * @param {string} [templateId]
 * @returns {Object} A resolved Genesis Template.
 * @throws {RangeError} When the named template, or every template, does not fit.
 * @memberof CyberiaProceduralSpec
 */
export function templateFor(source, profile, origin, templateId = '') {
  if (!templateId) return sourceTemplate(source, profile, origin);
  const template = resolveTemplate(genesisTemplate(templateId));
  const problems = [
    ...templateProblems(template, profile),
    ...compatibilityProblems(template, generationSource(source, origin).renderSource, source.data.item.type),
  ];
  if (problems.length > 0)
    throw new RangeError(
      `Genesis Template ${templateId} does not fit item ${source.data.item.id}: ${problems.join('; ')}`,
    );
  return template;
}

/**
 * The generation spec of a request: the mode checked; the generator, its profile and the templates
 * resolved; the sources read; a palette chosen for each candidate; all held in full.
 * @param {Object} models
 * @param {Object} request - See {@link checkRequest}.
 * @returns {Promise<{spec:Object,profile:Object,generator:Object}>}
 * @throws {Error} 400 on anything the engine cannot run; 404 for an item that does not exist.
 * @memberof CyberiaProceduralSpec
 */
export async function resolveSpec(models, request) {
  const input = checkRequest(request);
  try {
    const update = input.mode === 'update-existing';
    const sources = update ? await Promise.all(input.itemIds.map((id) => loadItemSource(models, id))) : [];
    const itemType = update ? sources[0].data.item.type : input.itemType;
    const mixed = sources.find(({ data }) => data.item.type !== itemType);
    if (mixed) throw new RangeError(`An update runs on one item type: ${mixed.data.item.id} is not ${itemType}`);
    const generator = resolveGenerator({ id: input.generator?.id, itemType, mode: input.mode });
    const profile = await models.CyberiaProceduralProfile.resolve(generator.defaultProfile);
    if (profile.generatorId !== generator.id)
      throw new RangeError(`Profile ${profile.profileId} drives ${profile.generatorId}, not ${generator.id}`);
    const baseline = update ? null : itemBaseline(itemType);
    const created = update ? null : createTemplate(input, profile);
    const originOfId = new Map(
      sources.map((source) => [
        source.data.item.id,
        originOf(source, input.fromTemplate.includes(source.data.item.id)),
      ]),
    );
    const templateOf = new Map(
      sources.map((source) => [
        source.data.item.id,
        templateFor(source, profile, originOfId.get(source.data.item.id), input.template?.id),
      ]),
    );
    const newIds = update
      ? []
      : (input.itemIds ?? Array.from({ length: input.variants }, (_, at) => proposedItemId(input.itemIdPrefix, at)));

    const rootSeed = input.seed.value;
    const targets = update
      ? sources.flatMap((source) =>
          Array.from({ length: input.variants }, (_, variant) => ({
            targetItemId: source.data.item.id,
            sourceCid: source.cid,
            template: templateOf.get(source.data.item.id),
            variant,
          })),
        )
      : newIds.map((targetItemId) => ({
          targetItemId,
          sourceCid: '',
          template: created,
          variant: 0,
        }));
    if (targets.length > MAX_JOB_ITEMS)
      throw new RangeError(`A job holds at most ${MAX_JOB_ITEMS} candidates, not ${targets.length}`);
    const templates = new Map();
    const palettes = new Map();
    const candidates = targets.map(({ targetItemId, sourceCid, template, variant }, ordinal) => {
      const { paletteId, slots } = specChoice(input, targetItemId);
      const palette =
        paletteId === RANDOM_PALETTE
          ? randomPalette({ rootSeed, itemId: targetItemId, variant })
          : paletteId
            ? paletteOf(paletteId)
            : null;
      candidatePalette(template, { palette, slots });
      templates.set(template.id, genesisTemplate(template.id));
      if (palette) palettes.set(palette.id, palette);
      return { ordinal, targetItemId, sourceCid, templateId: template.id, paletteId: palette?.id ?? null };
    });

    const { variation, ...operators } = generator.parameters(
      { ...input.parameters, ...(input.level !== undefined && { variation: input.level }) },
      profile,
    );
    return {
      generator,
      profile,
      spec: {
        mode: input.mode,
        itemType,
        generator: { id: generator.id },
        profile,
        templates: [...templates.values()],
        palette: input.palette,
        palettes: [...palettes.values()],
        ...(baseline && { baseline }),
        sources: sources.map((source) => ({
          itemId: source.data.item.id,
          cid: source.cid,
          itemType: source.data.item.type,
          hasRender: source.renderSource !== null,
          artDirection: source.artDirection,
          origin: originOfId.get(source.data.item.id),
          templateId: templateOf.get(source.data.item.id).id,
        })),
        candidates,
        output: update
          ? { variantsPerItem: input.variants }
          : input.itemIds
            ? { itemIds: input.itemIds }
            : { variants: input.variants, itemIdPrefix: input.itemIdPrefix },
        variation: { level: variation },
        seed: input.seed,
        parameters: operators,
      },
    };
  } catch (error) {
    throw error.status ? error : requestError(error.message);
  }
}

/**
 * The palette a target starts from: the Genesis Template it takes, its foundation palettes, and the
 * default of each color slot with its origin under the palette `paletteId` names. The
 * target is an existing item of an update, or the Genesis Template of a create.
 * @param {Object} models
 * @param {Object} target
 * @param {string} [target.itemId] - An existing item.
 * @param {string} [target.templateId] - The Genesis Template the item takes, or the template of a create.
 * @param {string} [target.paletteId] - A palette of the library.
 * @param {boolean} [target.fromTemplate] - Whether the candidates of the item start from the template.
 * @returns {Promise<{templateId:string,palettes:Array<{id:string,name:string,group:string}>,slots:Object<string,{color:string,origin:string}>}>}
 * @throws {Error} 404 for an item that is not a Cyberia item here; 400 for what no generator, template or palette fits.
 * @memberof CyberiaProceduralSpec
 */
export async function paletteDefaults(models, { itemId, templateId, paletteId, fromTemplate = false }) {
  const source = itemId ? await loadItemSource(models, itemId) : null;
  try {
    const itemType = source ? source.data.item.type : resolveTemplate(genesisTemplate(templateId)).itemType;
    const generator = resolveGenerator({ itemType, mode: source ? 'update-existing' : 'create-new' });
    const profile = await models.CyberiaProceduralProfile.resolve(generator.defaultProfile);
    const origin = source && originOf(source, fromTemplate);
    const template = source
      ? templateFor(source, profile, origin, templateId)
      : createTemplate({ itemType, template: { id: templateId } }, profile);
    const artDirection = source?.artDirection ?? null;
    const sourceBase =
      origin === 'render'
        ? generator.prepare(resolveProceduralContext({ source, template, profile, artDirection, origin })).sourceBase
        : {};
    return {
      templateId: template.id,
      palettes: (artDirection?.palettes ?? []).map(({ id, name, group }) => ({ id, name, group })),
      slots: slotDefaults({
        template,
        palette: paletteId ? paletteOf(paletteId) : null,
        artDirection,
        sourceBase,
      }),
    };
  } catch (error) {
    throw error.status ? error : requestError(error.message);
  }
}

/**
 * The color slots of a frame import: the roles of a palette of the library.
 * @memberof CyberiaProceduralSpec
 */
export const IMPORT_SLOTS = Object.freeze([...PALETTE_ROLES, ...GENERATOR_ROLES]);

/** The import slots the foundation palettes of an item color: bases in order, the first outline, the first accent or special. */
const foundationImportColors = (palettes) => {
  const first = (...names) =>
    names.map((name) => palettes.map(({ roles }) => roles[name]?.[0]).find(Boolean)).find(Boolean);
  const bases = palettes.flatMap(({ roles }) => roles.base ?? []);
  return {
    ...Object.fromEntries(PALETTE_ROLES.map((role, at) => [role, bases[at]])),
    outline: first('outline'),
    accent: first('accent', 'special'),
  };
};

/**
 * The palette a frame import remaps to, slot by slot: a palette of the library when the author
 * chose one, else the foundation palettes of the item, else the first palette of the library. Each
 * slot names where its color comes from; a slot no color reaches is left out.
 * @param {{itemId?:string,paletteId?:string}} params - The item the frames go to, and the chosen palette.
 * @returns {{templateId:string,palettes:Object[],slots:Object<string,{color:string,origin:string}>}}
 * @throws {Error} 400 for an unknown palette.
 * @memberof CyberiaProceduralSpec
 */
export function importPaletteDefaults({ itemId, paletteId }) {
  const palettes = (itemId && artDirectionOf(itemId)?.palettes) || [];
  let colors;
  let origin = 'palette';
  try {
    if (paletteId) colors = paletteOf(paletteId).roles;
    else if (palettes.length > 0) {
      colors = foundationImportColors(palettes);
      origin = 'foundation';
    } else colors = paletteCatalog().palettes[0]?.roles ?? {};
  } catch (error) {
    throw requestError(error.message);
  }
  return {
    templateId: '',
    palettes: palettes.map(({ id, name, group }) => ({ id, name, group })),
    slots: Object.fromEntries(
      IMPORT_SLOTS.filter((slot) => colors[slot]).map((slot) => [slot, { color: colors[slot], origin }]),
    ),
  };
}

/**
 * The roles a frame import remaps to: the palette of {@link importPaletteDefaults} under the slot
 * colors the author set, as one lightness ramp with its outline and accent.
 * @param {{itemId?:string,paletteId?:string,slots?:Object<string,string>}} params
 * @returns {Object<string,string[]>}
 * @throws {Error} 400 for an unknown palette, slot or color.
 * @memberof CyberiaProceduralSpec
 */
export function importRoles({ itemId, paletteId, slots = {} }) {
  if (!isPlain(slots)) throw requestError('palette.slots maps an import slot to a #rrggbb color');
  for (const [slot, color] of Object.entries(slots)) {
    if (!IMPORT_SLOTS.includes(slot)) throw requestError(`${slot} is not an import slot: ${IMPORT_SLOTS.join(', ')}`);
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) throw requestError(`${slot} is not a #rrggbb color`);
  }
  const defaults = importPaletteDefaults({ itemId, paletteId }).slots;
  const roles = Object.fromEntries(
    IMPORT_SLOTS.map((slot) => [slot, slots[slot] ?? defaults[slot]?.color]).filter(([, color]) => color),
  );
  if (!roles.outline && !PALETTE_ROLES.some((role) => roles[role]))
    throw requestError('The palette of the import holds no color');
  return rampRoles({ roles });
}

/**
 * What a client shows of a Genesis Template: its identity, canvas and roles with the palette role
 * each takes, its color slots with the color the template gives each, what stops it from serving the profile of
 * its generator, and the base item a create draws from it, as wire render frames with every frame of
 * each direction. A template content holds in a broken form shows only its identity and the reason.
 * @param {Object} stored - A Genesis Template as content holds it.
 * @param {Object[]} drivers - Each generator with its profile.
 * @returns {Object}
 */
function templateView(stored, drivers) {
  let template;
  try {
    template = resolveTemplate(stored);
  } catch (error) {
    const { id, name, description, itemType } = stored;
    return { id, name, description, itemType, problems: [error.message], preview: null };
  }
  const driver = drivers.find(({ generator }) => generator.itemType === template.itemType);
  const problems = driver
    ? templateProblems(template, driver.profile)
    : [`there is no generator for ${template.itemType}`];
  const baseFrames =
    problems.length === 0 &&
    driver.generator.prepare(
      resolveProceduralContext({
        source: baselineSource(template.itemType, itemBaseline(template.itemType)),
        template,
        profile: driver.profile,
      }),
    ).baseFrames;
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    itemType: template.itemType,
    canvas: template.canvas,
    roles: Object.fromEntries(
      Object.entries(template.roles).map(([role, { regions, palette, artDirection }]) => [
        role,
        { regions, palette, artDirection },
      ]),
    ),
    slots: paletteSlots(template),
    slotColors: templateSlotColors(template),
    frames: Object.fromEntries(Object.entries(template.directions).map(([code, frames]) => [code, frames.length])),
    baseline: RENDER_FRAME_CONTRACT[template.itemType] ?? {},
    problems,
    preview: baseFrames
      ? toWire(sourceFromDirectionFrames({ framesByCode: baseFrames, frameDurationMs: template.frameDurationMs }))
      : null,
  };
}

/**
 * What a client needs to build a request: the generators with their modes and profile, the Genesis
 * Templates with a preview of each, the palette catalog, the limits, and whether the served content
 * is older than the content checkout.
 * @param {{CyberiaProceduralProfile: import('mongoose').Model}} models
 * @returns {Promise<Object>}
 * @memberof CyberiaProceduralSpec
 */
export async function proceduralConfig({ CyberiaProceduralProfile }) {
  const drivers = await Promise.all(
    Object.values(GENERATORS).map(async (generator) => ({
      generator,
      profile: await CyberiaProceduralProfile.resolve(generator.defaultProfile),
    })),
  );
  return {
    generators: drivers.map(({ generator: { id, itemType, modes }, profile }) => ({
      id,
      itemType,
      modes,
      profile: {
        profileId: profile.profileId,
        regionOrder: profile.regionOrder,
        protectedRegions: profile.constraints.protectedRegions,
      },
    })),
    templates: genesisTemplates().map((template) => templateView(template, drivers)),
    palettes: paletteCatalog(),
    limits: { maxCandidates: MAX_JOB_ITEMS },
    content: contentFreshness(),
  };
}

/**
 * A random color for each color slot of a Genesis Template: one hue scheme over the lightness of the
 * template. Each call draws a new scheme. It is a preview for the editor; a run never draws from it.
 * @param {string} templateId
 * @returns {{slots:Object<string,string>}}
 * @throws {Error} 400 for a template the content does not hold.
 * @memberof CyberiaProceduralSpec
 */
export function randomSlots(templateId) {
  try {
    return { slots: randomSlotColors(resolveTemplate(genesisTemplate(templateId)), seededRandom(randomInt(SEED_LIMIT))) };
  } catch (error) {
    throw requestError(error.message);
  }
}
