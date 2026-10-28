/**
 * Global content in the content release.
 *
 * The content artifact carries global content as one file per definition, `global/<cid>.json`,
 * from `src/content/global/` of the cyberia-content sources. A file holds the canonical payload of
 * the definition, the render it names (the primary render as pinned and its layout), the item ids
 * the catalog bound to it, and its `CyberiaGlobalContent` row. `cyberia content-release export-live`
 * writes the files from a host backup; `cyberia content import --global` restores them into a
 * release, after the foundation and the sagas and before the instances, so the binding a file
 * froze replaces the composition of the foundation or a saga, as an instance snapshot does.
 *
 * @module src/projects/cyberia/content/global-content-source.js
 * @namespace CyberiaGlobalContentSource
 */
import fs from 'fs-extra';
import path from 'node:path';
import { canonicalObjectLayer } from '../../../client/components/objectlayer-studio/ObjectLayerProtocol.js';
import { objectLayerIdentity, parseIdentityJson } from '../../../api/object-layer/object-layer.identity.js';
import { AtlasSpriteSheetService } from '../../../api/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { bindItem, findBoundCid } from '../catalog/object-layer-catalog.js';
import { importDefinition, previewImport } from '../catalog/object-layer-import.js';
import { ownedCids } from '../catalog/global-content.js';
import { DataBaseProviderService } from '../../../db/DataBaseProvider.js';
import { planObjectLayer } from './content-artifact.js';

/** The directory of global content in the artifact and in the content sources. */
export const GLOBAL_CONTENT_DIR = 'global';

/** The most rows a reconciliation lists of the definitions it leaves out. */
const REPORT_LIMIT = 50;

/** The JSON text of a content file, in the canonical form of the content sources. */
const contentJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The file of one global content row: the definition, its render, the item ids bound to it and the row.
 * @param {Object} models - {@link catalogModels}.
 * @param {Object} row - A lean `CyberiaGlobalContent` row.
 * @param {Object} options - Router options of the content store.
 * @returns {Promise<Object>}
 * @throws {Error} When this host stores no published copy, or the render it names is unavailable.
 * @memberof CyberiaGlobalContentSource
 */
export async function globalContentFile(models, row, options) {
  const cid = row.objectLayerCid;
  const definition = await models.ObjectLayer.findOne({ cid, origin: { $ne: 'draft' } }).lean();
  if (!definition) throw new Error(`${cid} is global content, but this content stores no published copy`);
  const render = await AtlasSpriteSheetService.renderOf(cid, options);
  const itemIds = (await models.CyberiaItemCatalog.distinct('itemId', { objectLayerCid: cid })).sort();
  return {
    definition: canonicalObjectLayer(definition),
    render: render && { layout: render.layout, primary: render.png.toString('base64') },
    itemIds,
    registration: {
      reason: row.reason,
      by: row.by ?? '',
      registeredAt: new Date(row.registeredAt).toISOString(),
      provenance: {
        domain: row.provenance?.domain ?? '',
        createdBy: row.provenance?.createdBy ?? '',
        createdAt: row.provenance?.createdAt ? new Date(row.provenance.createdAt).toISOString() : null,
      },
    },
  };
}

/**
 * Writes every global content row of a content store to a directory, one file per CID. The
 * directory is replaced whole, so it holds what the store holds.
 * @param {Object} models - {@link catalogModels}.
 * @param {{dir:string, options:Object}} params
 * @returns {Promise<string[]>} The CIDs written, sorted.
 * @memberof CyberiaGlobalContentSource
 */
export async function exportGlobalContent(models, { dir, options }) {
  const rows = await DataBaseProviderService.getModel('CyberiaGlobalContent', options)
    .find({})
    .sort({ objectLayerCid: 1 })
    .lean();
  fs.emptyDirSync(dir);
  for (const row of rows)
    fs.writeFileSync(
      path.join(dir, `${row.objectLayerCid}.json`),
      contentJson(await globalContentFile(models, row, options)),
    );
  return rows.map(({ objectLayerCid }) => objectLayerCid);
}

/**
 * Reads one global content file: the definition as identity JSON, which refuses a repeated
 * property, and the render bytes.
 * @param {string} cid - The CID the file is named by.
 * @param {string} text - The file.
 * @returns {{definition:Object, render:{primary:Buffer,metadata:Object}|null, itemIds:string[], registration:Object}}
 * @throws {Error} When the file is not identity JSON, or its definition is another CID.
 * @memberof CyberiaGlobalContentSource
 */
export function readGlobalContentFile(cid, text) {
  const file = parseIdentityJson(text);
  const named = objectLayerIdentity(file.definition).cid;
  if (named !== cid) throw new Error(`global/${cid}.json holds definition ${named}`);
  return {
    definition: file.definition,
    render: file.render && { primary: Buffer.from(file.render.primary, 'base64'), metadata: file.render.layout },
    itemIds: file.itemIds ?? [],
    registration: file.registration,
  };
}

/**
 * Restores the global content of a content artifact into a content store: each definition and its
 * render through the import and its checks, its row as the file holds it, and each item id bound to
 * it as the file froze it. Idempotent.
 * @param {Object} models - {@link catalogModels}.
 * @param {Object} params
 * @param {Object} params.artifact - The content artifact: {@link contentArtifact}.
 * @param {Object} params.options - Router options of the content store.
 * @returns {Promise<Array<{cid:string, stored:Object, itemIds:string[]}>>}
 * @throws {Error} On the first definition that does not import.
 * @memberof CyberiaGlobalContentSource
 */
export async function restoreGlobalContent(models, { artifact, options }) {
  const restored = [];
  for (const cid of artifact.manifest.global ?? []) {
    const { definition, render, itemIds, registration } = readGlobalContentFile(cid, artifact.globalContent(cid));
    const { stored } = await importDefinition(
      models,
      { definition, render, acknowledged: true, actor: registration.by, registration },
      options,
    );
    for (const itemId of itemIds)
      await bindItem({
        models,
        itemId,
        objectLayerCid: cid,
        expectedCid: await findBoundCid(models, itemId),
        source: 'snapshot',
        options,
      });
    restored.push({ cid, stored, itemIds });
  }
  return restored;
}

/**
 * The CIDs the content artifact and the world snapshots carry without global content: the
 * definition each instance snapshot freezes, and the definition the import of the foundation or a
 * saga composes for an item with no render.
 * @param {Object} params
 * @param {Object} params.artifact - The content artifact: {@link contentArtifact}.
 * @param {string[]} params.snapshots - Instance snapshot directories.
 * @returns {Set<string>}
 * @memberof CyberiaGlobalContentSource
 */
export function representedCids({ artifact, snapshots }) {
  const cids = new Set();
  for (const dir of snapshots) {
    const frozen = path.join(dir, 'object-layers');
    if (!fs.existsSync(frozen)) continue;
    for (const name of fs.readdirSync(frozen).filter((file) => file.endsWith('.json')))
      cids.add(parseIdentityJson(fs.readFileSync(path.join(frozen, name), 'utf8')).cid);
  }
  const composed = [
    ...artifact.foundation.objectLayers,
    ...artifact.manifest.sagas.flatMap((code) => artifact.saga(code).families.objectLayers),
  ];
  for (const item of composed) cids.add(planObjectLayer(item, null).cid);
  return cids;
}

/**
 * Registers the definitions a content store must keep but nothing else carries: each definition an
 * item binding names, and each definition a player stack holds, when no world snapshot and no
 * artifact composition carries it. A definition the store lacks is imported from the Object Layer
 * authority, with its render from IPFS, by the checks of an import. Without `apply` it stores
 * nothing: it reports what it would add. Idempotent.
 * @param {Object} models - {@link catalogModels}.
 * @param {Object} params
 * @param {Object} params.options - Router options of the content store.
 * @param {Set<string>} params.represented - {@link representedCids}.
 * @param {string[]} [params.owned] - The CIDs players own; defaults to the profiles this host serves.
 * @param {boolean} [params.apply=false]
 * @param {string} [params.by='reconcile']
 * @returns {Promise<{applied:boolean, registered:number, represented:number, added:Object[], invalid:Object[], unreferenced:{count:number, cids:string[]}}>}
 *   `added` rows are `{cid, reason, itemIds}`; `invalid` rows `{cid, reason, problem}`; `unreferenced`
 *   counts the published definitions nothing keeps, which stay out of the release.
 * @memberof CyberiaGlobalContentSource
 */
export async function reconcileGlobalContent(
  models,
  { options, represented, owned, apply = false, by = 'reconcile' },
) {
  const registered = new Set(
    await DataBaseProviderService.getModel('CyberiaGlobalContent', options).distinct('objectLayerCid'),
  );
  const bindings = await models.CyberiaItemCatalog.find({}, { itemId: 1, objectLayerCid: 1 }).lean();
  const reasons = new Map(bindings.map(({ objectLayerCid }) => [objectLayerCid, 'catalog']));
  for (const cid of owned ?? (await ownedCids(options))) if (!reasons.has(cid)) reasons.set(cid, 'owned');

  const report = { applied: apply, registered: registered.size, represented: 0, added: [], invalid: [] };
  for (const [cid, reason] of [...reasons].sort(([a], [b]) => a.localeCompare(b))) {
    if (registered.has(cid)) continue;
    if (represented.has(cid)) {
      report.represented++;
      continue;
    }
    try {
      if (apply)
        await importDefinition(models, { cid, acknowledged: true, actor: by, registration: { reason, by } }, options);
      else {
        const { validation } = await previewImport(models, { cid }, options);
        if (!validation.ok) throw new Error(validation.problems.join('; '));
      }
      const itemIds = bindings.filter((entry) => entry.objectLayerCid === cid).map(({ itemId }) => itemId);
      report.added.push({ cid, reason, itemIds });
    } catch (error) {
      report.invalid.push({ cid, reason, problem: error.message });
    }
  }

  const kept = new Set([...registered, ...reasons.keys(), ...represented]);
  const unreferenced = (await models.ObjectLayer.distinct('cid', { origin: { $ne: 'draft' } }))
    .filter((cid) => !kept.has(cid))
    .sort();
  report.unreferenced = { count: unreferenced.length, cids: unreferenced.slice(0, REPORT_LIMIT) };
  return report;
}
