/**
 * Import of Object Layer definitions from the Object Layer authority into the Cyberia catalog.
 *
 * A moderator finds a definition at the authority, previews it, and binds it to an item id of
 * Cyberia. Every read goes to the authority origin the deploy configures (`domainOrigin`) under its
 * public read contract, and a request names only a CID or a search text: no request makes the server
 * fetch another URL. The answer is untrusted input: its bytes must hash to the CID asked for, the
 * definition must follow the Cyberia profile with a known item type and valid stats, and its frames
 * must decode within the limits below. The protocol carries no license or author: the preview says
 * so, and the moderator confirms each warning before the import.
 *
 * The import stores a `cache` copy of the canonical bytes, its render frames and its atlas on this
 * host, so the game, the catalog and the Object Layer Viewer resolve it with no request to the
 * authority. Then it binds the item through the one binding write, under the binding the moderator
 * saw, with its provenance in the binding history, and the game servers reload. Each step is
 * idempotent: an import again, or after a failure, stores nothing twice and resumes where it stopped.
 *
 * @module src/projects/cyberia/catalog/object-layer-import.js
 * @namespace CyberiaObjectLayerImport
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { isObjectLayerCid, objectLayerIdentity } from '../../../api/object-layer/object-layer.identity.js';
import { cacheCanonical } from '../../../api/object-layer/object-layer.publication.js';
import { AtlasSpriteSheetStore } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import { CyberiaObjectLayerProfile } from '../../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { fromWire, toWire } from '../../../client/components/objectlayer-studio/RenderSource.js';
import { domainOrigin, domainRead } from '../../../server/domain/domain-client.js';
import { bindItem } from './object-layer-catalog.js';

/** The domain whose authority an import reads. */
const AUTHORITY = 'object-layer';

/**
 * What an imported definition holds at most: the bytes of its canonical JSON, the side of a frame,
 * its frames, and its pixels. The largest render frames of the content artifact are 26 × 26 pixels
 * in 33 frames, 362 KB as JSON.
 * @constant {Readonly<{definitionBytes:number,side:number,frames:number,pixels:number}>}
 * @memberof CyberiaObjectLayerImport
 */
const IMPORT_LIMITS = Object.freeze({ definitionBytes: 64 * 1024, side: 256, frames: 512, pixels: 4 * 1024 * 1024 });

/** The rows one search answers. */
const SEARCH_LIMIT = 20;

/** The keyframe a preview draws: the down idle frame, else the first keyframe. */
const PREVIEW_KEYFRAMES = Object.freeze(['down_idle', 'default_idle', 'none_idle']);

const failure = (status, message) => Object.assign(new Error(message), { status, expected: true });
const model = (name, options) => DataBaseProviderService.getModel(name, options);

/** The host of the authority, as provenance names it. */
const authorityHost = () => {
  const origin = domainOrigin(AUTHORITY);
  return origin ? new URL(origin).host : '';
};

/** One definition of the authority, as a search lists it. */
const rowOf = ({ cid, profile, data, createdAt, archivedAt }) => ({
  cid,
  itemId: data?.item?.id ?? '',
  itemType: data?.item?.type ?? '',
  description: data?.item?.description ?? '',
  profile: profile ? `${profile.id} v${profile.version}` : '',
  archived: Boolean(archivedAt),
  createdAt: createdAt ?? null,
});

/**
 * Searches the canonical definitions of the authority: by CID, or by a part of the item id.
 * @param {{q?:string}} query
 * @returns {Promise<{data:Object[]}>}
 * @throws {Error} 400 for a text over 64 characters; 503 when the authority does not answer or no origin is set.
 * @memberof CyberiaObjectLayerImport
 */
export async function searchAuthority({ q }) {
  const text = String(q ?? '').trim();
  if (!text) return { data: [] };
  if (isObjectLayerCid(text)) {
    const definition = await domainRead({ domain: AUTHORITY, path: `object-layer/${text}`, cacheTtlMs: 0 });
    return { data: definition ? [rowOf(definition)] : [] };
  }
  if (text.length > 64) throw failure(400, 'A search names at most 64 characters');
  const page = await domainRead({
    domain: AUTHORITY,
    path: 'object-layer',
    cacheTtlMs: 0,
    query: {
      filterModel: JSON.stringify({
        'data.item.id': { filterType: 'text', type: 'contains', filter: text },
        status: { values: ['canonical'] },
      }),
      limit: SEARCH_LIMIT,
    },
  });
  return { data: (page?.data ?? []).map(rowOf) };
}

/**
 * The definition a CID names and its render frames: the copy this host stores when it is no draft,
 * else the answer of the authority.
 * @returns {Promise<{definition:Object,frames:Object|null,stored:{definition:boolean,frames:boolean,atlas:boolean},framesProblem:string}>}
 */
async function readSource(cid, options) {
  const local = await model('ObjectLayer', options).findOne({ cid }).lean();
  if (local && local.origin !== 'draft') {
    const RenderFrames = model('ObjectLayerRenderFrames', options);
    const [stored, atlas] = await Promise.all([
      RenderFrames.findOne({ objectLayerCid: cid }).lean(),
      model('AtlasSpriteSheet', options).exists({ objectLayerCid: cid }),
    ]);
    return {
      definition: local,
      frames: stored ? RenderFrames.sourceOf(stored) : null,
      stored: { definition: true, frames: Boolean(stored), atlas: Boolean(atlas) },
      framesProblem: '',
    };
  }
  const definition = await domainRead({ domain: AUTHORITY, path: `object-layer/${cid}`, cacheTtlMs: 0 });
  if (!definition) throw failure(404, `The Object Layer authority holds no definition ${cid}`);
  if (typeof definition.data?.item !== 'object' || typeof definition.profile !== 'object')
    throw failure(502, `The Object Layer authority answered ${cid} with no definition`);
  const render = await domainRead({ domain: AUTHORITY, path: `object-layer/render/${cid}`, cacheTtlMs: 0 });
  let frames = null;
  let framesProblem = '';
  if (render?.renderFrames)
    try {
      frames = fromWire(render.renderFrames);
    } catch (error) {
      framesProblem = `Its render frames do not decode: ${error.message}`;
    }
  return { definition, frames, stored: { definition: false, frames: false, atlas: false }, framesProblem };
}

/** The problems that stop an import of a source, and the warnings the moderator confirms. */
function validationOf(cid, { definition, frames, framesProblem }) {
  const problems = [];
  const warnings = [];
  const { profile, data } = definition;
  const identity = objectLayerIdentity({ profile, data });
  if (identity.cid !== cid) problems.push(`Its bytes hash to ${identity.cid}, not ${cid}`);
  if (Buffer.byteLength(JSON.stringify({ profile, data })) > IMPORT_LIMITS.definitionBytes)
    problems.push(`Its definition is over ${IMPORT_LIMITS.definitionBytes / 1024} KB`);
  if (profile?.id !== CyberiaObjectLayerProfile.id)
    problems.push(`It follows the profile ${profile?.id ?? 'none'}, not ${CyberiaObjectLayerProfile.id}`);
  else if (profile.version !== CyberiaObjectLayerProfile.version)
    warnings.push(
      `It follows version ${profile.version} of the profile; this host runs ${CyberiaObjectLayerProfile.version}`,
    );
  if (!CyberiaObjectLayerProfile.itemTypes.includes(data?.item?.type))
    problems.push(`${data?.item?.type || 'No item type'} is not a Cyberia item type`);
  try {
    CyberiaObjectLayerProfile.validateStats(data?.stats);
  } catch (error) {
    problems.push(`Its stats are not valid: ${error.message}`);
  }
  if (definition.archivedAt) problems.push('The authority archived it');
  if (framesProblem) problems.push(framesProblem);
  if (frames) {
    const lists = Object.values(frames.frames);
    const count = lists.reduce((sum, list) => sum + list.length, 0);
    if (frames.width > IMPORT_LIMITS.side || frames.height > IMPORT_LIMITS.side)
      problems.push(`Its frames are over ${IMPORT_LIMITS.side} pixels a side`);
    if (count > IMPORT_LIMITS.frames) problems.push(`It has over ${IMPORT_LIMITS.frames} frames`);
    if (count * frames.width * frames.height > IMPORT_LIMITS.pixels) problems.push('Its frames hold too many pixels');
    if (count === 0) warnings.push('It has no frames: the item runs with no artwork');
  } else if (!framesProblem) warnings.push('It has no render frames: the item runs with no artwork');
  warnings.push('It names no license or author: the Object Layer protocol carries none; confirm the right to use it');
  return { ok: problems.length === 0, problems, warnings };
}

/** The frame a preview draws, in wire form: one frame of the idle keyframe. */
const previewOf = (frames) => {
  const keyframe = PREVIEW_KEYFRAMES.find((key) => frames.frames[key]?.length) ?? Object.keys(frames.frames)[0];
  if (!keyframe) return null;
  const { width, height, palette, frameDurationMs } = frames;
  return {
    keyframe,
    ...toWire({
      format: frames.format,
      width,
      height,
      palette,
      frameDurationMs,
      frames: { [keyframe]: [frames.frames[keyframe][0]] },
    }),
  };
};

/** A source, its validation and the binding of the item id it would take. */
async function inspect(models, { cid, itemId }, options) {
  if (!isObjectLayerCid(cid)) throw failure(400, 'An import names the CID of an Object Layer definition');
  if (itemId !== undefined && itemId !== '' && !(typeof itemId === 'string' && /^[\w.-]{1,128}$/.test(itemId)))
    throw failure(400, 'An item id is 1 to 128 letters, digits, dots, hyphens or underscores');
  const source = await readSource(cid, options);
  const target = itemId || source.definition.data?.item?.id || '';
  const binding = target ? (await models.CyberiaItemCatalog.bindingsOf([target])).get(target) : undefined;
  return { source, validation: validationOf(cid, source), target, binding: binding ?? null };
}

/**
 * What an import of a definition would do: the definition with its source, its render and a preview
 * frame, what this host stores of it already, the problems and warnings, and the binding of the item
 * id it would take. Stores nothing.
 * @param {Object} models - {@link catalogModels}.
 * @param {{cid:string,itemId?:string}} request - `itemId` defaults to the item id of the definition.
 * @param {Object} options - Router options.
 * @returns {Promise<Object>}
 * @throws {Error} 400 for a request with a defect; 404 when the authority holds no such definition;
 *   503 when the authority does not answer.
 * @memberof CyberiaObjectLayerImport
 */
export async function previewImport(models, request, options) {
  const { source, validation, target, binding } = await inspect(models, request, options);
  const { definition, frames, stored } = source;
  return {
    cid: request.cid,
    source: {
      domain: authorityHost(),
      createdBy: definition.createdBy ?? '',
      createdAt: definition.createdAt ?? null,
    },
    item: {
      id: definition.data.item?.id ?? '',
      type: definition.data.item?.type ?? '',
      description: definition.data.item?.description ?? '',
    },
    profile: definition.profile,
    stats: definition.data.stats ?? {},
    render: frames && {
      width: frames.width,
      height: frames.height,
      colors: frames.palette.length,
      frameDurationMs: frames.frameDurationMs,
      frames: Object.fromEntries(Object.entries(frames.frames).map(([keyframe, list]) => [keyframe, list.length])),
      preview: previewOf(frames),
    },
    stored,
    validation,
    target: {
      itemId: target,
      boundCid: binding?.cid ?? '',
      revision: binding?.revision ?? 0,
      unchanged: binding?.cid === request.cid,
      replaces: Boolean(binding) && binding.cid !== request.cid,
    },
  };
}

/**
 * Imports a definition and binds it to an item id: it stores the canonical bytes, the render frames
 * and the atlas here when they are not stored yet, then binds the item under the binding the
 * moderator saw, with the provenance in the binding history, and reloads the game servers. A
 * definition the item runs already changes no binding.
 * @param {Object} models - {@link catalogModels}.
 * @param {Object} request
 * @param {string} request.cid
 * @param {string} [request.itemId] - Defaults to the item id of the definition.
 * @param {string} request.expectedCid - The definition the moderator saw the item run; empty when unbound.
 * @param {boolean} [request.replace] - Whether the moderator decided to replace another binding.
 * @param {boolean} [request.acknowledged] - Whether the moderator confirmed the warnings.
 * @param {string} request.actor
 * @param {Object} options - Router options.
 * @param {(options:Object)=>Promise<*>} [reload] - Reloads the game servers after a new binding.
 * @returns {Promise<{cid:string,itemId:string,binding:string,stored:Object,renderCid:string,entry:Object}>}
 *   `binding` is `bound`, `replaced` or `unchanged`; `stored` says what this import stored.
 * @throws {Error} 400 for a definition that does not import, or unconfirmed warnings; 409 when the
 *   item runs another definition than the moderator saw, or a replacement was not decided.
 * @memberof CyberiaObjectLayerImport
 */
export async function importDefinition(models, request, options, reload) {
  const { cid, expectedCid, replace, acknowledged, actor } = request;
  const { source, validation, target, binding } = await inspect(models, request, options);
  if (!validation.ok) throw failure(400, `Definition ${cid} does not import: ${validation.problems.join('; ')}`);
  if (acknowledged !== true) throw failure(400, `Confirm the warnings first: ${validation.warnings.join('; ')}`);
  if ((expectedCid ?? '') !== (binding?.cid ?? ''))
    throw failure(409, `'${target}' runs ${binding?.cid || 'no definition'}, not ${expectedCid || 'no definition'}`);
  if (binding && binding.cid !== cid && replace !== true)
    throw failure(409, `'${target}' runs ${binding.cid}: decide to replace that binding first`);

  const { definition, frames, stored } = source;
  const RenderFrames = model('ObjectLayerRenderFrames', options);
  const wrote = { definition: false, frames: false, atlas: false };
  if (!stored.definition) {
    await cacheCanonical({ ObjectLayer: models.ObjectLayer, cid, definition, options });
    wrote.definition = true;
  }
  if (frames && !stored.frames) {
    await RenderFrames.materialize(cid, frames);
    wrote.frames = true;
  }
  let renderCid = definition.data.render?.cid ?? '';
  if (frames && !stored.atlas) {
    const rendered = await AtlasSpriteSheetStore.build({
      itemKey: definition.data.item.id,
      objectLayerRenderFrames: frames,
      options,
    });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: cid, atlas: rendered.atlas, options });
    renderCid = rendered.render.cid;
    wrote.atlas = true;
  }
  const warnings = [...validation.warnings];
  if (renderCid && definition.data.render?.cid && renderCid !== definition.data.render.cid)
    warnings.push(`Its frames build the render ${renderCid} here, not ${definition.data.render.cid}`);

  const unchanged = binding?.cid === cid;
  const entry = unchanged
    ? await models.CyberiaItemCatalog.findOne({ itemId: target }).lean()
    : await bindItem({
        models,
        itemId: target,
        objectLayerCid: cid,
        expectedCid: binding?.cid ?? null,
        source: 'import',
        by: String(actor),
        provenance: {
          domain: authorityHost(),
          createdBy: definition.createdBy ?? '',
          createdAt: definition.createdAt ?? null,
          warnings,
          acknowledged: true,
        },
        options,
      });
  if (!unchanged) await reload?.(options);
  return {
    cid,
    itemId: target,
    binding: unchanged ? 'unchanged' : binding ? 'replaced' : 'bound',
    stored: wrote,
    renderCid,
    entry,
  };
}
