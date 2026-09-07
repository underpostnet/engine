/**
 * What content an instance owns, and which skills follow from it.
 *
 * An instance is a set of maps plus the content bound to them. Everything else it needs —
 * atlases to draw, skills to fire — follows from the item ids that content names. Deriving
 * that set in one place is what keeps the export, the capture, the boot payload and the
 * editor's report agreeing: they used to each answer "what belongs to this world" slightly
 * differently, and a skill would export but not boot, or boot but not export.
 */

/** A '$'-prefixed id is a runtime placeholder the simulation resolves, never a document. */
const isMaterialItemId = (itemId) => typeof itemId === 'string' && itemId.length > 0 && !itemId.startsWith('$');

/**
 * Every ObjectLayer item id an instance's own content names.
 *
 * Four sources, and they are the whole list: what its maps place, what its entity-type
 * defaults wire, what its vendors and assemblers trade, and what its quests ask for or pay
 * out. A skill trigger is not a source — skills are selected from this set, not folded into
 * it — and neither is another instance's content.
 *
 * @param {object} content
 * @param {Array<{entities?: Array<{objectLayerItemIds?: string[]}>}>} [content.maps]
 * @param {Array<object>} [content.entityDefaults] - Resolved documents, not references.
 * @param {Array<object>} [content.actions] - Vendor / assembler catalogs.
 * @param {Array<object>} [content.quests]
 * @returns {Set<string>} Item ids, placeholders excluded.
 */
function collectInstanceItemIds({ maps = [], entityDefaults = [], actions = [], quests = [] } = {}) {
  const itemIds = new Set();
  const push = (itemId) => {
    if (isMaterialItemId(itemId)) itemIds.add(itemId);
  };

  for (const map of maps) {
    for (const entity of map?.entities || []) (entity?.objectLayerItemIds || []).forEach(push);
  }
  for (const entityDefault of entityDefaults) {
    for (const list of ['liveItemIds', 'deadItemIds', 'dropItemIds', 'inventoryItemsIds']) {
      (entityDefault?.[list] || []).forEach(push);
    }
  }
  for (const action of actions) {
    for (const shopItem of action?.shopItems || []) {
      push(shopItem?.itemId);
      push(shopItem?.priceItemId);
    }
    for (const recipe of action?.craftRecipes || []) {
      (recipe?.ingredients || []).forEach((ingredient) => push(ingredient?.itemId));
      (recipe?.outputItems || []).forEach((output) => push(output?.itemId));
    }
  }
  for (const quest of quests) {
    for (const step of quest?.steps || []) {
      for (const objective of step?.objectives || []) push(objective?.itemId);
    }
    for (const reward of quest?.rewards || []) push(reward?.itemId);
  }
  return itemIds;
}

/**
 * The skills an instance runs: one per trigger item its content names.
 *
 * This is the whole membership rule, and it is why `hatchet` belongs to a world whose maps
 * place no hatchet — a quest objective or a vendor's shelf names it, so an entity there can
 * come to hold one and fire it. A skill for a trigger nothing in the world names is
 * unreachable and is left out.
 *
 * @param {Array<{triggerItemId?: string}>} skills - Candidate CyberiaSkill documents.
 * @param {Set<string>|string[]} itemIds - {@link collectInstanceItemIds} output.
 * @returns {Array<object>} The subset that belongs, in the order given.
 */
function selectInstanceSkills(skills = [], itemIds = new Set()) {
  const owned = itemIds instanceof Set ? itemIds : new Set(itemIds);
  return skills.filter((skill) => skill?.triggerItemId && owned.has(skill.triggerItemId));
}

/**
 * Item ids the given skills summon, which need atlases of their own.
 *
 * Folded back into the instance's item set after selection, never before: a summoned bullet
 * is drawn by the world, but it does not make the world own a skill that summons it.
 *
 * @param {Array<{skills?: Array<{summonedEntityItemId?: string}>}>} skills
 * @returns {Set<string>}
 */
function collectSummonedItemIds(skills = []) {
  const itemIds = new Set();
  for (const skill of skills) {
    for (const definition of skill?.skills || []) {
      if (isMaterialItemId(definition?.summonedEntityItemId)) itemIds.add(definition.summonedEntityItemId);
    }
  }
  return itemIds;
}

export { collectInstanceItemIds, collectSummonedItemIds, isMaterialItemId, selectInstanceSkills };
