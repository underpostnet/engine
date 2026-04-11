const CyberiaDependencies = {
  'maxrects-packer': '^2.7.3',
  pngjs: '^7.0.0',
  jimp: '^1.6.0',
  sharp: '^0.34.5',
  ethers: '~6.16.0',
};

const DefaultCyberiaItems = [
  { item: { id: 'coin', type: 'coin' } },
  // { item: { id: 'red-power', type: 'skill' } },
  // { item: { id: 'heal', type: 'skill' } },
  // { item: { id: 'hatchet-skill', type: 'skill' } },
  // { item: { id: 'green-power', type: 'skill' } },
  // { item: { id: 'blood', type: 'skill' } },
  { item: { id: 'atlas_pistol_mk2', type: 'weapon' } },
  { item: { id: 'atlas_pistol_mk2_bullet', type: 'skill' } },
  // { item: { id: 'tim-knife', type: 'weapon' } },
  { item: { id: 'hatchet', type: 'weapon' } },
  { item: { id: 'wason', type: 'skin' } },
  { item: { id: 'scp-2040', type: 'skin' } },
  { item: { id: 'purple', type: 'skin' } },
  { item: { id: 'punk', type: 'skin' } },
  // { item: { id: 'marciano', type: 'skin' } },
  { item: { id: 'lain', type: 'skin' } },
  { item: { id: 'kaneki', type: 'skin' } },
  { item: { id: 'junko', type: 'skin' } },
  { item: { id: 'ghost', type: 'skin' } },
  { item: { id: 'eiri', type: 'skin' } },
  { item: { id: 'anon', type: 'skin' } },
  { item: { id: 'alex', type: 'skin' } },
  { item: { id: 'agent', type: 'skin' } },
  { item: { id: 'grass', type: 'floor' } },
];

const DefaultSkillConfig = [
  // { triggerItemId: 'anon', logicEventIds: ['doppelganger'] },
  {
    triggerItemId: 'atlas_pistol_mk2',
    logicEventIds: ['atlas_pistol_mk2_logic'],
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

export { CyberiaDependencies, DefaultCyberiaItems, DefaultSkillConfig, DefaultCyberiaDialogues };
