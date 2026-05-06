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
const QUEST_STEPS_TYPES = Object.freeze(['collect', 'talk', 'kill']);
const CYBERIA_ACTION_TYPES = Object.freeze(['craft', 'shop', 'storage', 'quest-talk']);
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
class CyberiaDependencies {
  static 'maxrects-packer' = '^2.7.3';
  static pngjs = '^7.0.0';
  static jimp = '^1.6.0';
  static sharp = '^0.34.5';
  static ethers = '~6.16.0';
}
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
 * Each entry follows the CyberiaDialogue model schema:
 *   { code, order, speaker, text, mood }
 *
 * `code` is the primary grouping key (e.g. "default-lain").  The C client
 * fetches all lines for a code with GET /api/cyberia-dialogue/code/:code.
 *
 * Used by the seed/migration script to populate the database on first boot.
 */
const DefaultCyberiaDialogues = [
  {
    code: 'default-coin',
    order: 0,
    speaker: 'Coin',
    text: 'A standard unit of exchange in the cyberia network.',
    mood: 'neutral',
  },
  {
    code: 'default-atlas_pistol_mk2',
    order: 0,
    speaker: 'Atlas Pistol MK2',
    text: 'Military-grade sidearm. Fires energy projectiles.',
    mood: 'neutral',
  },
  {
    code: 'default-atlas_pistol_mk2_bullet',
    order: 0,
    speaker: 'MK2 Bullet',
    text: 'High-velocity energy round. Dissipates on impact.',
    mood: 'neutral',
  },
  {
    code: 'default-hatchet',
    order: 0,
    speaker: 'Hatchet',
    text: 'A crude but reliable melee tool. Good for close quarters.',
    mood: 'neutral',
  },
  {
    code: 'default-wason',
    order: 0,
    speaker: 'Wason',
    text: 'They say I am just a wandering merchant... but I have seen things.',
    mood: 'neutral',
  },
  {
    code: 'default-wason',
    order: 1,
    speaker: 'Wason',
    text: 'The network was not always like this. There was a time before the portals.',
    mood: 'sad',
  },
  {
    code: 'default-scp-2040',
    order: 0,
    speaker: 'SCP-2040',
    text: 'CONTAINMENT PROTOCOL ACTIVE. Do not make direct eye contact.',
    mood: 'angry',
  },
  {
    code: 'default-scp-2040',
    order: 1,
    speaker: 'SCP-2040',
    text: 'I remember everything. Every iteration. Every reset.',
    mood: 'sad',
  },
  {
    code: 'default-purple',
    order: 0,
    speaker: 'Purple',
    text: 'The void between nodes is not empty — it is alive.',
    mood: 'neutral',
  },
  {
    code: 'default-punk',
    order: 0,
    speaker: 'Punk',
    text: 'Rules are just code someone else wrote. I write my own.',
    mood: 'happy',
  },
  {
    code: 'default-lain',
    order: 0,
    speaker: 'Lain',
    text: 'No matter where you go, everyone is connected.',
    mood: 'neutral',
  },
  {
    code: 'default-lain',
    order: 1,
    speaker: 'Lain',
    text: 'If you are not remembered, then you never existed.',
    mood: 'sad',
  },
  {
    code: 'default-lain',
    order: 2,
    speaker: 'Lain',
    text: 'The wired is not a separate world. It is layered over this one.',
    mood: 'neutral',
  },
  {
    code: 'default-kaneki',
    order: 0,
    speaker: 'Kaneki',
    text: 'I am not the protagonist of a novel. I am just... me.',
    mood: 'sad',
  },
  {
    code: 'default-kaneki',
    order: 1,
    speaker: 'Kaneki',
    text: 'What is 1000 minus 7?',
    mood: 'angry',
  },
  {
    code: 'default-junko',
    order: 0,
    speaker: 'Junko',
    text: 'Despair is the seed from which hope blooms!',
    mood: 'happy',
  },
  {
    code: 'default-junko',
    order: 1,
    speaker: 'Junko',
    text: 'How boring... nothing ever surprises me anymore.',
    mood: 'sad',
  },
  { code: 'default-ghost', order: 0, speaker: 'Ghost', text: '...', mood: 'neutral' },
  {
    code: 'default-eiri',
    order: 0,
    speaker: 'Eiri',
    text: 'I am the god of the wired. I designed the protocol.',
    mood: 'neutral',
  },
  {
    code: 'default-eiri',
    order: 1,
    speaker: 'Eiri',
    text: 'Flesh is just hardware. Consciousness is the only software that matters.',
    mood: 'neutral',
  },
  {
    code: 'default-anon',
    order: 0,
    speaker: '???',
    text: 'You should not be here. Turn back.',
    mood: 'angry',
  },
  {
    code: 'default-anon',
    order: 1,
    speaker: '???',
    text: 'Or stay. It does not matter. Nothing leaves this place.',
    mood: 'neutral',
  },
  {
    code: 'default-alex',
    order: 0,
    speaker: 'Alex',
    text: 'I have been mapping the portal network. Something does not add up.',
    mood: 'neutral',
  },
  {
    code: 'default-alex',
    order: 1,
    speaker: 'Alex',
    text: 'There are nodes that exist in the registry but have no physical anchor.',
    mood: 'neutral',
  },
  {
    code: 'default-agent',
    order: 0,
    speaker: 'Agent',
    text: 'Civilian, this area is restricted. State your business.',
    mood: 'neutral',
  },
  {
    code: 'default-agent',
    order: 1,
    speaker: 'Agent',
    text: 'Hmm. Proceed, but know that you are being watched.',
    mood: 'neutral',
  },
  {
    code: 'default-grass',
    order: 0,
    speaker: 'Grass',
    text: 'A patch of synthetic grass. It sways gently despite no wind.',
    mood: 'neutral',
  },
  // ── Quest-talk dialogue lines ────────────────────────────────────────────
  {
    code: 'quest-talk-wason',
    order: 0,
    speaker: 'Wason',
    text: 'Wanderer! Glad you stopped by. I need a favor — nothing dangerous... mostly.',
    mood: 'happy',
  },
  {
    code: 'quest-talk-wason',
    order: 1,
    speaker: 'Wason',
    text: "First, find Alex — she's been surveying the nodes east of here. Then gather a hatchet for me.",
    mood: 'neutral',
  },
  {
    code: 'quest-talk-wason',
    order: 2,
    speaker: 'Wason',
    text: 'And one more thing: the SCP-2040 anomalies are overrunning my trade routes. Deal with two of them.',
    mood: 'sad',
  },
  {
    code: 'quest-talk-alex',
    order: 0,
    speaker: 'Alex',
    text: "Wason sent you? Good. The portal anomalies are getting worse. I've logged what I can.",
    mood: 'neutral',
  },
  {
    code: 'quest-talk-alex',
    order: 1,
    speaker: 'Alex',
    text: 'Tell Wason: the source is somewhere in the deeper nodes. The registry does not lie.',
    mood: 'neutral',
  },
];

/**
 * Default action catalog — provide base metadata default actions,
 * this provide for entities dynamicaale match when init instance init x and init y
 * positions of entitie for the fallback world or custom instance, and seed dialogue
 * for quest-talk actions.
 *
 * type values:          'quest-talk' | 'shop' | 'craft' | 'storage'
 * dialogCode:           General-purpose default dialogue opened for this action
 *                       (any action type). Used as the immediate greeting/intro.
 * questDialogueCodes:   Ordered list of CyberiaDialogue codes that must be
 *                       completed (in sequence) to satisfy quest-talk step
 *                       validation.  Distinct from dialogCode — for simple
 *                       actions they may overlap; for multi-stage quests they
 *                       can diverge.
 *                       is completed.  Empty string = no quest granted.
 */
const DefaultCyberiaActions = [
  {
    code: 'wason-quest-intro',
    type: 'quest-talk',
    label: 'Quest',
    provideItemId: 'wason',
    grantQuestCode: 'fallback-intro-quest',
    dialogCode: 'quest-talk-wason',
    questDialogueCodes: ['quest-talk-wason'],
  },
  {
    code: 'alex-quest-talk',
    type: 'quest-talk',
    label: 'Quest Talk',
    provideItemId: 'alex',
    grantQuestCode: '',
    dialogCode: 'quest-talk-alex',
    questDialogueCodes: ['quest-talk-alex'],
  },
  {
    code: 'agent-mission-brief',
    type: 'quest-talk',
    label: 'Mission Brief',
    provideItemId: 'agent',
    grantQuestCode: 'bounty-quest-alpha',
    dialogCode: 'default-agent',
    questDialogueCodes: ['default-agent'],
  },
  {
    code: 'wason-bounty-brief',
    type: 'quest-talk',
    label: 'Bounty Brief',
    provideItemId: 'wason',
    grantQuestCode: '',
    dialogCode: 'quest-talk-wason',
    questDialogueCodes: ['quest-talk-wason'],
  },
];

/**
 * Default quest definitions for the fallback world.
 * Mirrors the CyberiaQuestSchema.
 *
 * Objective types:
 *   'talk'    — itemId = provideItemId of the NPC to interact with
 *   'collect' — itemId = item to receive in inventory; quantity = amount
 *   'kill'    — itemId = entity skin itemId; quantity = kill count
 *
 */
const DefaultCyberiaQuests = [
  {
    code: 'fallback-intro-quest',
    title: "The Wanderer's Task",
    description: 'Help Wason restore order to the fractured nodes.',
    prerequisiteCodes: [],
    unlocksQuestCodes: ['bounty-quest-alpha'],
    steps: [
      {
        id: 'step-talk-alex',
        description: 'Find Alex and hear her report on the portal anomalies.',
        objectives: [{ type: 'talk', itemId: 'alex', quantity: 1 }],
      },
      {
        id: 'step-collect-hatchet',
        description: 'Obtain a hatchet for Wason.',
        objectives: [{ type: 'collect', itemId: 'hatchet', quantity: 1 }],
      },
      {
        id: 'step-kill-scp',
        description: 'Eliminate SCP-2040 anomalies threatening the trade routes.',
        objectives: [{ type: 'kill', itemId: 'scp-2040', quantity: 2 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 50 }],
  },
  {
    // Second quest: exercises all step types in a different order (kill → collect → talk).
    // Unlocked automatically after completing fallback-intro-quest.
    code: 'bounty-quest-alpha',
    title: 'Alpha Bounty',
    description: 'A field test: eliminate a threat, claim your reward, then report back.',
    prerequisiteCodes: ['fallback-intro-quest'],
    unlocksQuestCodes: [],
    steps: [
      {
        id: 'step-kill-first',
        description: 'Eliminate the SCP-2040 threat.',
        objectives: [{ type: 'kill', itemId: 'scp-2040', quantity: 1 }],
      },
      {
        id: 'step-collect-reward',
        description: 'Collect the bounty coin drop.',
        objectives: [{ type: 'collect', itemId: 'coin', quantity: 10 }],
      },
      {
        id: 'step-report-wason',
        description: 'Report back to Wason.',
        objectives: [{ type: 'talk', itemId: 'wason', quantity: 1 }],
      },
    ],
    rewards: [{ itemId: 'hatchet', quantity: 1 }],
  },
];

export {
  ITEM_TYPES,
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  QUEST_STEPS_TYPES,
  CYBERIA_ACTION_TYPES,
  getDefaultCyberiaItemById,
  getDefaultCyberiaItemsByItemType,
  getDefaultCyberiaItemsByEntityType,
  CyberiaDependencies,
  DefaultCyberiaItems,
  DefaultSkillConfig,
  DefaultCyberiaDialogues,
  DefaultCyberiaActions,
  DefaultCyberiaQuests,
};
