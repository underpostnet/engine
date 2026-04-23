/**
 * Shared Cyberia plain-data module.
 * Keep this file free of runtime-specific imports so the same registry can be
 * consumed by client, server, and CLI code.
 */

const ITEM_TYPES = Object.freeze({
  skin: 'skin',
  breastplate: 'breastplate',
  weapon: 'weapon',
  skill: 'skill',
  coin: 'coin',
  floor: 'floor',
  obstacle: 'obstacle',
  portal: 'portal',
  foreground: 'foreground',
  resource: 'resource',
});

const ENTITY_TYPES = Object.freeze({
  player: 'player',
  other_player: 'other_player',
  bot: 'bot',
  skill: 'skill',
  coin: 'coin',
  floor: 'floor',
  obstacle: 'obstacle',
  portal: 'portal',
  foreground: 'foreground',
  resource: 'resource',
});

const ENTITY_TYPE_TO_ITEM_TYPES = Object.freeze({
  [ENTITY_TYPES.player]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.other_player]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.bot]: Object.freeze([ITEM_TYPES.skin, ITEM_TYPES.weapon]),
  [ENTITY_TYPES.skill]: Object.freeze([ITEM_TYPES.skill]),
  [ENTITY_TYPES.coin]: Object.freeze([ITEM_TYPES.coin]),
  [ENTITY_TYPES.floor]: Object.freeze([ITEM_TYPES.floor]),
  [ENTITY_TYPES.obstacle]: Object.freeze([ITEM_TYPES.obstacle]),
  [ENTITY_TYPES.portal]: Object.freeze([ITEM_TYPES.portal]),
  [ENTITY_TYPES.foreground]: Object.freeze([ITEM_TYPES.foreground]),
  [ENTITY_TYPES.resource]: Object.freeze([ITEM_TYPES.resource]),
});

const CyberiaDependencies = {
  'maxrects-packer': '^2.7.3',
  pngjs: '^7.0.0',
  jimp: '^1.6.0',
  sharp: '^0.34.5',
  ethers: '~6.16.0',
};

const DefaultCyberiaItems = [
  { item: { id: 'coin', type: ITEM_TYPES.coin } },
  // { item: { id: 'red-power', type: 'skill' } },
  // { item: { id: 'heal', type: 'skill' } },
  { item: { id: 'hatchet-skill', type: ITEM_TYPES.skill } },
  // { item: { id: 'green-power', type: 'skill' } },
  // { item: { id: 'blood', type: 'skill' } },
  { item: { id: 'atlas_pistol_mk2', type: ITEM_TYPES.weapon } },
  { item: { id: 'atlas_pistol_mk2_bullet', type: ITEM_TYPES.skill } },
  { item: { id: 'tim-knife', type: ITEM_TYPES.weapon } },
  { item: { id: 'hatchet', type: ITEM_TYPES.weapon } },
  { item: { id: 'wason', type: ITEM_TYPES.skin } },
  { item: { id: 'scp-2040', type: ITEM_TYPES.skin } },
  { item: { id: 'purple', type: ITEM_TYPES.skin } },
  { item: { id: 'punk', type: ITEM_TYPES.skin } },
  // { item: { id: 'marciano', type: 'skin' } },
  { item: { id: 'lain', type: ITEM_TYPES.skin } },
  { item: { id: 'kaneki', type: ITEM_TYPES.skin } },
  { item: { id: 'junko', type: ITEM_TYPES.skin } },
  { item: { id: 'ghost', type: ITEM_TYPES.skin } },
  { item: { id: 'eiri', type: ITEM_TYPES.skin } },
  { item: { id: 'anon', type: ITEM_TYPES.skin } },
  { item: { id: 'alex', type: ITEM_TYPES.skin } },
  { item: { id: 'agent', type: ITEM_TYPES.skin } },
  { item: { id: 'grass', type: ITEM_TYPES.floor } },
];

const DEFAULT_CYBERIA_ITEM_BY_ID = Object.freeze(
  DefaultCyberiaItems.reduce((acc, entry) => {
    acc[entry.item.id] = entry;
    return acc;
  }, {}),
);

const getDefaultCyberiaItemById = (itemId) => DEFAULT_CYBERIA_ITEM_BY_ID[itemId] || null;

const getDefaultCyberiaItemsByItemType = (itemType) =>
  DefaultCyberiaItems.filter((entry) => entry.item.type === itemType);

const getDefaultCyberiaItemsByEntityType = (entityType) => {
  const allowedTypes = ENTITY_TYPE_TO_ITEM_TYPES[entityType] || [];
  return DefaultCyberiaItems.filter((entry) => allowedTypes.includes(entry.item.type));
};

const DefaultSkillConfig = [
  // { triggerItemId: 'anon', logicEventIds: ['doppelganger'] },
  {
    triggerItemId: 'atlas_pistol_mk2',
    logicEventIds: ['projectile'],
  },
  { triggerItemId: 'coin', logicEventIds: ['coin_drop_or_transaction'] },
  // { triggerItemId: 'purple', logicEventIds: ['doppelganger'] },
  // { triggerItemId: 'atlas_pistol_mk2_bullet', logicEventIds: ['doppelganger'] },
];

/**
 * Default dialogue seeds for every non-commented entry in DefaultCyberiaItems.
 * Each item maps to an array of dialogue records following the CyberiaDialogue
 * model schema: { itemId, order, speaker, text, mood }.
 *
 * Used by the seed/migration script to populate the database on first boot.
 * The C client fetches these at runtime via GET /api/cyberia-dialogue?...
 */
const DefaultCyberiaDialogues = [
  {
    itemId: 'coin',
    order: 0,
    speaker: 'Coin',
    text: 'A standard unit of exchange in the cyberia network.',
    mood: 'neutral',
  },
  {
    itemId: 'atlas_pistol_mk2',
    order: 0,
    speaker: 'Atlas Pistol MK2',
    text: 'Military-grade sidearm. Fires energy projectiles.',
    mood: 'neutral',
  },
  {
    itemId: 'atlas_pistol_mk2_bullet',
    order: 0,
    speaker: 'MK2 Bullet',
    text: 'High-velocity energy round. Dissipates on impact.',
    mood: 'neutral',
  },
  {
    itemId: 'hatchet',
    order: 0,
    speaker: 'Hatchet',
    text: 'A crude but reliable melee tool. Good for close quarters.',
    mood: 'neutral',
  },
  {
    itemId: 'wason',
    order: 0,
    speaker: 'Wason',
    text: 'They say I am just a wandering merchant... but I have seen things.',
    mood: 'neutral',
  },
  {
    itemId: 'wason',
    order: 1,
    speaker: 'Wason',
    text: 'The network was not always like this. There was a time before the portals.',
    mood: 'sad',
  },
  {
    itemId: 'scp-2040',
    order: 0,
    speaker: 'SCP-2040',
    text: 'CONTAINMENT PROTOCOL ACTIVE. Do not make direct eye contact.',
    mood: 'angry',
  },
  {
    itemId: 'scp-2040',
    order: 1,
    speaker: 'SCP-2040',
    text: 'I remember everything. Every iteration. Every reset.',
    mood: 'sad',
  },
  {
    itemId: 'purple',
    order: 0,
    speaker: 'Purple',
    text: 'The void between nodes is not empty — it is alive.',
    mood: 'neutral',
  },
  {
    itemId: 'punk',
    order: 0,
    speaker: 'Punk',
    text: 'Rules are just code someone else wrote. I write my own.',
    mood: 'happy',
  },
  {
    itemId: 'lain',
    order: 0,
    speaker: 'Lain',
    text: 'No matter where you go, everyone is connected.',
    mood: 'neutral',
  },
  {
    itemId: 'lain',
    order: 1,
    speaker: 'Lain',
    text: 'If you are not remembered, then you never existed.',
    mood: 'sad',
  },
  {
    itemId: 'lain',
    order: 2,
    speaker: 'Lain',
    text: 'The wired is not a separate world. It is layered over this one.',
    mood: 'neutral',
  },
  {
    itemId: 'kaneki',
    order: 0,
    speaker: 'Kaneki',
    text: 'I am not the protagonist of a novel. I am just... me.',
    mood: 'sad',
  },
  { itemId: 'kaneki', order: 1, speaker: 'Kaneki', text: 'What is 1000 minus 7?', mood: 'angry' },
  { itemId: 'junko', order: 0, speaker: 'Junko', text: 'Despair is the seed from which hope blooms!', mood: 'happy' },
  {
    itemId: 'junko',
    order: 1,
    speaker: 'Junko',
    text: 'How boring... nothing ever surprises me anymore.',
    mood: 'sad',
  },
  { itemId: 'ghost', order: 0, speaker: 'Ghost', text: '...', mood: 'neutral' },
  {
    itemId: 'eiri',
    order: 0,
    speaker: 'Eiri',
    text: 'I am the god of the wired. I designed the protocol.',
    mood: 'neutral',
  },
  {
    itemId: 'eiri',
    order: 1,
    speaker: 'Eiri',
    text: 'Flesh is just hardware. Consciousness is the only software that matters.',
    mood: 'neutral',
  },
  { itemId: 'anon', order: 0, speaker: '???', text: 'You should not be here. Turn back.', mood: 'angry' },
  {
    itemId: 'anon',
    order: 1,
    speaker: '???',
    text: 'Or stay. It does not matter. Nothing leaves this place.',
    mood: 'neutral',
  },
  {
    itemId: 'alex',
    order: 0,
    speaker: 'Alex',
    text: 'I have been mapping the portal network. Something does not add up.',
    mood: 'neutral',
  },
  {
    itemId: 'alex',
    order: 1,
    speaker: 'Alex',
    text: 'There are nodes that exist in the registry but have no physical anchor.',
    mood: 'neutral',
  },
  {
    itemId: 'agent',
    order: 0,
    speaker: 'Agent',
    text: 'Civilian, this area is restricted. State your business.',
    mood: 'neutral',
  },
  {
    itemId: 'agent',
    order: 1,
    speaker: 'Agent',
    text: 'Hmm. Proceed, but know that you are being watched.',
    mood: 'neutral',
  },
  {
    itemId: 'grass',
    order: 0,
    speaker: 'Grass',
    text: 'A patch of synthetic grass. It sways gently despite no wind.',
    mood: 'neutral',
  },
];

export {
  ITEM_TYPES,
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  getDefaultCyberiaItemById,
  getDefaultCyberiaItemsByItemType,
  getDefaultCyberiaItemsByEntityType,
  CyberiaDependencies,
  DefaultCyberiaItems,
  DefaultSkillConfig,
  DefaultCyberiaDialogues,
};
