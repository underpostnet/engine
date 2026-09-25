/**
 * Pinned Object Layer references in persisted Cyberia content.
 *
 * Content names an item by label for display and authoring, and pins the definition it means
 * by `objectLayerCid`. Rebinding a label in the catalog never changes what pinned content
 * means. Every pinned path is declared here, so one module knows what content references.
 *
 * @module src/api/cyberia-item-catalog/item-ref.js
 * @namespace CyberiaItemRef
 */
import { OBJECT_LAYER_CID_PATTERN } from '../object-layer/object-layer.identity.js';

/**
 * Schema fields of a pinned reference. `objectLayerCid` is empty only before the content is
 * pinned; {@link pinContentReferences} fills it from the catalog.
 * @memberof CyberiaItemRef
 */
export const ItemRefFields = {
  itemId: { type: String, required: true, trim: true },
  objectLayerCid: { type: String, default: '', trim: true, match: [/^$|^bafkrei[a-z2-7]{52}$/, 'objectLayerCid must be an Object Layer CID'] },
};

/**
 * Where persisted content pins definitions: collection → the label/cid field pairs, under the
 * document paths that hold them.
 * @memberof CyberiaItemRef
 */
export const PINNED_REFERENCES = Object.freeze({
  CyberiaQuest: Object.freeze([
    { path: 'steps[].objectives[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'rewards[]', itemId: 'itemId', cid: 'objectLayerCid' },
  ]),
  CyberiaAction: Object.freeze([
    { path: 'shopItems[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'shopItems[]', itemId: 'priceItemId', cid: 'priceObjectLayerCid' },
    { path: 'craftRecipes[].outputItems[]', itemId: 'itemId', cid: 'objectLayerCid' },
    { path: 'craftRecipes[].ingredients[]', itemId: 'itemId', cid: 'objectLayerCid' },
  ]),
});

/** Every object a `path` such as `steps[].objectives[]` selects in a document. */
const select = (document, path) => {
  let nodes = [document];
  for (const segment of path.split('.')) {
    const key = segment.replace('[]', '');
    const next = [];
    for (const node of nodes) {
      const value = node?.[key];
      if (value === undefined || value === null) continue;
      if (segment.endsWith('[]')) next.push(...(Array.isArray(value) ? value : []));
      else next.push(value);
    }
    nodes = next;
  }
  return nodes;
};

/**
 * Reads every pinned reference of a document.
 * @param {Object} document - A lean document or a payload.
 * @param {ReadonlyArray<{path:string,itemId:string,cid:string}>} references - One collection's declarations.
 * @returns {Array<{node:Object,itemId:string,cid:string,itemIdField:string,cidField:string}>}
 * @memberof CyberiaItemRef
 */
export function readItemRefs(document, references) {
  const found = [];
  for (const reference of references) {
    for (const node of select(document, reference.path)) {
      const itemId = node?.[reference.itemId];
      if (!itemId) continue;
      found.push({
        node,
        itemId,
        cid: node[reference.cid] || '',
        itemIdField: reference.itemId,
        cidField: reference.cid,
      });
    }
  }
  return found;
}

/**
 * Pins every unpinned reference of the declared collections to the definition the catalog
 * binds its label to, and moves every reference to a replaced definition onto its replacement.
 * Idempotent: any other reference that names a definition keeps it.
 *
 * @param {Object} params
 * @param {Object<string,import('mongoose').Model>} params.models - Models by name, including `CyberiaItemCatalog`.
 * @param {Map<string,string>} [params.replacements=new Map()] - Replaced cid → the cid that replaces it.
 * @returns {Promise<{pinned:number,unbound:Array<{collection:string,code:string,itemId:string}>}>}
 * @memberof CyberiaItemRef
 */
export async function pinContentReferences({ models, replacements = new Map() }) {
  const result = { pinned: 0, unbound: [] };
  for (const [collection, references] of Object.entries(PINNED_REFERENCES)) {
    const Model = models[collection];
    if (!Model) continue;
    for (const document of await Model.find({})) {
      const refs = readItemRefs(document, references).filter((ref) => !ref.cid || replacements.has(ref.cid));
      if (refs.length === 0) continue;
      const bindings = await models.CyberiaItemCatalog.resolve(refs.filter((ref) => !ref.cid).map((ref) => ref.itemId));
      let changed = false;
      for (const ref of refs) {
        const cid = ref.cid ? replacements.get(ref.cid) : bindings.get(ref.itemId);
        if (!cid) {
          result.unbound.push({ collection, code: document.code, itemId: ref.itemId });
          continue;
        }
        ref.node[ref.cidField] = cid;
        changed = true;
        result.pinned++;
      }
      if (changed) {
        for (const reference of references) document.markModified(reference.path.replaceAll('[]', '').split('.')[0]);
        await document.save();
      }
    }
  }
  return result;
}

/**
 * The definitions persisted content pins, by label.
 * @param {Object[]} documents - Lean documents of one collection.
 * @param {ReadonlyArray<{path:string,itemId:string,cid:string}>} references - That collection's declarations.
 * @param {Map<string,Set<string>>} [into=new Map()] - Accumulator, label → pinned cids.
 * @returns {Map<string,Set<string>>}
 * @memberof CyberiaItemRef
 */
export function collectPinnedCids(documents = [], references, into = new Map()) {
  for (const document of documents) {
    for (const { itemId, cid } of readItemRefs(document, references)) {
      if (!cid) continue;
      if (!into.has(itemId)) into.set(itemId, new Set());
      into.get(itemId).add(cid);
    }
  }
  return into;
}

export { OBJECT_LAYER_CID_PATTERN };
