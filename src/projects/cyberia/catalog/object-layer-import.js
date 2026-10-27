/**
 * Import of Object Layer definitions into the Cyberia live content.
 *
 * A moderator names a definition by its CID, or gives its document: the data of one definition
 * under the Cyberia profile. The definition is enough. Its render contract names the primary render
 * and its layout on IPFS; the import reads both, checks them against their CIDs, and rebuilds the
 * render frames and the atlas from them. A request names only a CID or a document: no request makes
 * the server fetch a URL. Every answer is untrusted input: an authority answer must hash to the CID
 * asked for, the definition must follow the Cyberia profile with a known item type and valid stats,
 * and its render must decode within the limits below. The protocol carries no license or author:
 * the preview says so, and the moderator confirms each warning before the import.
 *
 * The import stores the definition, its render frames and its atlas on this host and pins the
 * render, so the game, the catalog and the Object Layer Viewer resolve it with no request to the
 * authority. A document the authority does not hold is published there first. A binding is
 * optional: the one binding write moves the item, under the binding the moderator saw, with its
 * provenance in the binding history. The game servers reload when an item runs what the import
 * changed. Each step is idempotent: an import again, or after a failure, stores nothing twice and
 * resumes where it stopped.
 *
 * @module src/projects/cyberia/catalog/object-layer-import.js
 * @namespace CyberiaObjectLayerImport
 */
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import {
  isObjectLayerCid,
  objectLayerIdentity,
  parseIdentityJson,
} from '../../../api/object-layer/object-layer.identity.js';
import { cacheCanonical, publishDefinition } from '../../../api/object-layer/object-layer.publication.js';
import { publishObjectLayerBundle, readRender } from '../../../api/object-layer/object-layer.ipfs.js';
import { AtlasSpriteSheetGenerator } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.generator.js';
import { AtlasSpriteSheetStore } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.store.js';
import {
  CATALOG_ITEM_ID_PATTERN,
  CyberiaObjectLayerProfile,
  DEFINITION_DOCUMENT_BYTES,
  definitionDocumentProblems,
} from '../../../client/components/cyberia/ObjectLayerProfileCyberia.js';
import { profileRef } from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { toWire } from '../../../client/components/objectlayer-studio/RenderSource.js';
import { domainHost, domainRead } from '../../../server/domain/domain-client.js';
import { bindItem } from './object-layer-catalog.js';

/** The domain whose authority an import reads. */
const AUTHORITY = 'object-layer';

/**
 * What the render of an imported definition holds at most: the side of a frame, its frames, and
 * their pixels. The largest render frames of the content artifact are 26 × 26 pixels in 33 frames.
 * @constant {Readonly<{side:number,frames:number,pixels:number}>}
 * @memberof CyberiaObjectLayerImport
 */
const IMPORT_LIMITS = Object.freeze({ side: 256, frames: 512, pixels: 4 * 1024 * 1024 });

/** The rows one search answers. */
const SEARCH_LIMIT = 20;

/** The keyframe a preview draws: the down idle frame, else the first keyframe. */
const PREVIEW_KEYFRAMES = Object.freeze(['down_idle', 'default_idle', 'none_idle']);

const LICENSE_WARNING =
  'It names no license or author: the Object Layer protocol carries none; confirm the right to use it';

const failure = (status, message) => Object.assign(new Error(message), { status, expected: true });
const model = (name, options) => DataBaseProviderService.getModel(name, options);

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

/** The definition a document gives: its data under the Cyberia profile this host runs. */
function documentDefinition(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > DEFINITION_DOCUMENT_BYTES)
    throw failure(400, `A definition document is JSON text of at most ${DEFINITION_DOCUMENT_BYTES / 1024} KB`);
  let data;
  try {
    data = parseIdentityJson(text);
  } catch (error) {
    throw failure(400, `The document is not JSON: ${error.message}`);
  }
  const problems = definitionDocumentProblems(data);
  if (problems.length) throw failure(400, `The document does not follow the definition format: ${problems.join('; ')}`);
  return { profile: profileRef(CyberiaObjectLayerProfile), data };
}

/**
 * The definition a CID names, and where it is: this host's copy when it is no draft, else the
 * authority's, else the document given.
 * @returns {Promise<{definition:Object,at:'host'|'authority'|'document'}>}
 */
async function definitionOf(cid, given, options) {
  const local = await model('ObjectLayer', options).findOne({ cid }).lean();
  if (local && local.origin !== 'draft') return { definition: local, at: 'host' };
  const held = await domainRead({ domain: AUTHORITY, path: `object-layer/${cid}`, cacheTtlMs: 0 });
  if (held) {
    if (typeof held.data?.item !== 'object' || typeof held.profile !== 'object')
      throw failure(502, `The Object Layer authority answered ${cid} with no definition`);
    return { definition: held, at: 'authority' };
  }
  if (given) return { definition: given, at: 'document' };
  throw failure(404, `The Object Layer authority holds no definition ${cid}`);
}

/**
 * The render frames and the render of a definition: the frames this host stores, else the frames
 * its render holds. The render comes from IPFS when this host lacks the frames or the atlas.
 * @returns {Promise<{stored:{frames:boolean,atlas:boolean},frames:Object|null,render:Object|null,problem:string}>}
 */
async function renderOf(cid, definition, options) {
  const RenderFrames = model('ObjectLayerRenderFrames', options);
  const [frames, atlas] = await Promise.all([
    RenderFrames.findOne({ objectLayerCid: cid }).lean(),
    model('AtlasSpriteSheet', options).exists({ objectLayerCid: cid }),
  ]);
  const found = {
    stored: { frames: Boolean(frames), atlas: Boolean(atlas) },
    frames: frames ? RenderFrames.sourceOf(frames) : null,
    render: null,
    problem: '',
  };
  const named = definition.data?.render ?? {};
  if (!named.cid && !named.metadataCid) return found;
  if (!isObjectLayerCid(named.cid) || !isObjectLayerCid(named.metadataCid))
    return { ...found, problem: 'Its render names no primary render and layout CID' };
  if (found.stored.frames && found.stored.atlas) return found;
  try {
    const render = await readRender(named);
    if (!render) return { ...found, problem: `IPFS holds no render ${named.cid} with its layout ${named.metadataCid}` };
    const source =
      found.frames ??
      (await AtlasSpriteSheetGenerator.sourceFromRender(render.primary, render.metadata, {
        maxPixels: IMPORT_LIMITS.pixels,
      }));
    return { ...found, frames: source, render };
  } catch (error) {
    return { ...found, problem: `Its render ${named.cid} does not decode: ${error.message}` };
  }
}

/** What an import of a source stores on this host. */
const storesOf = (at, { stored, frames, render }) => ({
  definition: at !== 'host',
  frames: Boolean(frames) && !stored.frames,
  atlas: Boolean(render) && !stored.atlas,
});

/** The problems that stop an import of a source, and the warnings the moderator confirms. */
function validationOf(cid, definition, { frames, problem }, target) {
  const problems = [];
  const warnings = [];
  const { profile, data } = definition;
  try {
    const identity = objectLayerIdentity({ profile, data });
    if (identity.cid !== cid) problems.push(`Its bytes hash to ${identity.cid}, not ${cid}`);
  } catch (error) {
    problems.push(`Its content is not canonical: ${error.message}`);
  }
  if (Buffer.byteLength(JSON.stringify({ profile, data })) > DEFINITION_DOCUMENT_BYTES)
    problems.push(`Its definition is over ${DEFINITION_DOCUMENT_BYTES / 1024} KB`);
  if (profile?.id !== CyberiaObjectLayerProfile.id)
    problems.push(`It follows the profile ${profile?.id ?? 'none'}, not ${CyberiaObjectLayerProfile.id}`);
  else if (profile.version !== CyberiaObjectLayerProfile.version)
    warnings.push(
      `It follows version ${profile.version} of the profile; this host runs ${CyberiaObjectLayerProfile.version}`,
    );
  if (!CyberiaObjectLayerProfile.itemTypes.includes(data?.item?.type))
    problems.push(`${data?.item?.type || 'No item type'} is not a Cyberia item type`);
  if (!CATALOG_ITEM_ID_PATTERN.test(target))
    problems.push(`${String(target).slice(0, 128) || 'No item id'} is not an item id of the catalog`);
  try {
    CyberiaObjectLayerProfile.validateStats(data?.stats);
  } catch (error) {
    problems.push(`Its stats are not valid: ${error.message}`);
  }
  if (definition.archivedAt) problems.push('The authority archived it');
  if (problem) problems.push(problem);
  else if (!data?.render?.cid) warnings.push('It names no render: the item runs with no artwork');
  if (frames) {
    const count = Object.values(frames.frames).reduce((sum, list) => sum + list.length, 0);
    if (frames.width > IMPORT_LIMITS.side || frames.height > IMPORT_LIMITS.side)
      problems.push(`Its frames are over ${IMPORT_LIMITS.side} pixels a side`);
    if (count > IMPORT_LIMITS.frames) problems.push(`It has over ${IMPORT_LIMITS.frames} frames`);
    if (count * frames.width * frames.height > IMPORT_LIMITS.pixels) problems.push('Its frames hold too many pixels');
    if (count === 0) warnings.push('It has no frames: the item runs with no artwork');
  }
  warnings.push(LICENSE_WARNING);
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

/**
 * A source, its render, its validation and the binding of the item id it would take.
 * @param {Object} models - {@link catalogModels}.
 * @param {{cid?:string,document?:string,itemId?:string}} request - A CID or a document, never both.
 * @param {Object} options - Router options.
 */
async function inspect(models, { cid: named, document, itemId }, options) {
  if (named !== undefined && document !== undefined)
    throw failure(400, 'An import names the CID of a definition or gives its document, not both');
  const given = document === undefined ? null : documentDefinition(document);
  const cid = given ? objectLayerIdentity(given).cid : named;
  if (!isObjectLayerCid(cid)) throw failure(400, 'An import names the CID of an Object Layer definition');
  if (itemId !== undefined && itemId !== '' && !(typeof itemId === 'string' && CATALOG_ITEM_ID_PATTERN.test(itemId)))
    throw failure(400, 'An item id is 1 to 128 letters, digits, dots, hyphens or underscores');
  const { definition, at } = await definitionOf(cid, given, options);
  const render = await renderOf(cid, definition, options);
  const target = itemId || definition.data?.item?.id || '';
  const binding = CATALOG_ITEM_ID_PATTERN.test(target)
    ? (await models.CyberiaItemCatalog.bindingsOf([target])).get(target)
    : undefined;
  return { cid, definition, at, render, validation: validationOf(cid, definition, render, target), target, binding };
}

/**
 * What an import of a definition would do: the definition with its source, its render and a
 * preview frame, what the import stores here, the problems and warnings, and the binding of the
 * item id it would take. Stores nothing.
 * @param {Object} models - {@link catalogModels}.
 * @param {{cid?:string,document?:string,itemId?:string}} request - `itemId` defaults to the item id of the definition.
 * @param {Object} options - Router options.
 * @returns {Promise<Object>}
 * @throws {Error} 400 for a request with a defect; 404 when the authority holds no such definition;
 *   503 when the authority does not answer.
 * @memberof CyberiaObjectLayerImport
 */
export async function previewImport(models, request, options) {
  const { cid, definition, at, render, validation, target, binding } = await inspect(models, request, options);
  const { frames } = render;
  return {
    cid,
    source: {
      domain: domainHost(AUTHORITY),
      at,
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
    stores: storesOf(at, render),
    validation,
    target: {
      itemId: target,
      boundCid: binding?.cid ?? '',
      revision: binding?.revision ?? 0,
      unchanged: binding?.cid === cid,
      replaces: Boolean(binding) && binding.cid !== cid,
    },
  };
}

/** Stores the definition here: a copy of the authority's, or the document published there first. */
async function storeDefinition(models, cid, definition, at, options) {
  if (at === 'authority') return await cacheCanonical({ ObjectLayer: models.ObjectLayer, cid, definition, options });
  try {
    return await publishDefinition({ ObjectLayer: models.ObjectLayer, payload: definition, options });
  } catch (error) {
    throw failure(502, error.message);
  }
}

/**
 * Imports a definition into the live content: it stores the definition, its render frames and its
 * atlas here when they are not stored yet, and pins the render. With `bind`, it binds the item under
 * the binding the moderator saw, with the provenance in the binding history. The game servers
 * reload when an item runs what changed.
 * @param {Object} models - {@link catalogModels}.
 * @param {Object} request
 * @param {string} [request.cid] - The definition, by its CID.
 * @param {string} [request.document] - The definition, by its document.
 * @param {string} [request.itemId] - Defaults to the item id of the definition.
 * @param {boolean} [request.bind] - Whether the import binds the item to the definition.
 * @param {string} [request.expectedCid] - With `bind`: the definition the moderator saw the item run; empty when unbound.
 * @param {boolean} [request.replace] - With `bind`: whether the moderator decided to replace another binding.
 * @param {boolean} [request.acknowledged] - Whether the moderator confirmed the warnings.
 * @param {string} request.actor
 * @param {Object} options - Router options.
 * @param {(options:Object)=>Promise<*>} [reload] - Reloads the game servers.
 * @returns {Promise<{cid:string,itemId:string,binding:string,stored:Object,entry:Object|null}>}
 *   `binding` is `bound`, `replaced`, `unchanged` (the item runs it already) or `none`; `stored` says
 *   what this import stored.
 * @throws {Error} 400 for a definition that does not import, or unconfirmed warnings; 409 when the
 *   item runs another definition than the moderator saw, or a replacement was not decided; 502 when
 *   the authority does not store a document.
 * @memberof CyberiaObjectLayerImport
 */
export async function importDefinition(models, request, options, reload) {
  const { bind, expectedCid, replace, acknowledged, actor } = request;
  const { cid, definition, at, render, validation, target, binding } = await inspect(models, request, options);
  if (!validation.ok) throw failure(400, `Definition ${cid} does not import: ${validation.problems.join('; ')}`);
  if (acknowledged !== true) throw failure(400, `Confirm the warnings first: ${validation.warnings.join('; ')}`);
  if (bind === true && (expectedCid ?? '') !== (binding?.cid ?? ''))
    throw failure(409, `'${target}' runs ${binding?.cid || 'no definition'}, not ${expectedCid || 'no definition'}`);
  if (bind === true && binding && binding.cid !== cid && replace !== true)
    throw failure(409, `'${target}' runs ${binding.cid}: decide to replace that binding first`);

  const stored = storesOf(at, render);
  const kept = stored.definition ? await storeDefinition(models, cid, definition, at, options) : definition;
  if (stored.frames) await model('ObjectLayerRenderFrames', options).materialize(cid, render.frames);
  if (stored.atlas) {
    const { atlas } = await AtlasSpriteSheetStore.storeRender({
      itemKey: definition.data.item.id,
      primary: render.render.primary,
      metadata: render.render.metadata,
      options,
    });
    await AtlasSpriteSheetStore.materialize({ objectLayerCid: cid, atlas, options });
    await publishObjectLayerBundle({ definition: kept, options });
  }

  const runs = binding?.cid === cid;
  const binds = bind === true && !runs;
  const entry = binds
    ? await bindItem({
        models,
        itemId: target,
        objectLayerCid: cid,
        expectedCid: binding?.cid ?? null,
        source: 'import',
        by: String(actor),
        provenance: {
          domain: domainHost(AUTHORITY),
          createdBy: definition.createdBy ?? '',
          createdAt: definition.createdAt ?? null,
          warnings: validation.warnings,
          acknowledged: true,
        },
        options,
      })
    : null;
  if (binds || (runs && (stored.frames || stored.atlas))) await reload?.(options);
  return {
    cid,
    itemId: target,
    binding: binds ? (binding ? 'replaced' : 'bound') : runs ? 'unchanged' : 'none',
    stored,
    entry,
  };
}
