/**
 * Canonical simulation defaults for the Cyberia runtime: per-entity-type item
 * sets, simulation / AOI / combat / economy / skill rules, equipment rules,
 * status-icon numeric IDs, and the seed content (dialogues, actions, quests)
 * the CLI writes to Mongo.
 *
 * STRICT BOUNDARY: never import this from `src/client/`. The browser bundler
 * resolves imports recursively, so one browser-side import ships the whole
 * simulation defaults in the public JS payload.
 *
 * Shared content vocabulary (item / entity type enums, `DefaultCyberiaItems`,
 * `ENTITY_TYPE_TO_ITEM_TYPES`, quest step objectives) lives in
 * `SharedDefaultsCyberia.js`.
 *
 * @module src/api/cyberia-server-defaults/cyberia-server-defaults.js
 */

// Shared vocabulary lives under src/client/ so the browser bundler resolves it.
import {
  ITEM_TYPES,
  STAT_TYPES,
  STAT_MODIFIER_MAX,
  ENTITY_LEVEL_MAX,
  ENTITY_TYPES,
  SKILL_LOGIC_ID_VALUES,
  isCanonicalSkillLogicId,
  AUDIO_BUSES,
  AUDIO_BUS_MUSIC,
  AUDIO_BUS_SFX,
  AUDIO_LOGIC_ID_BUSES,
  AUDIO_LOGIC_ID_VALUES,
  isCanonicalAudioLogicId,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

export const DOCKER_COMPOSE_ID = 'cyberia';

export const DEPLOY_ID = 'dd-cyberia';

// ─────────────────────────────────────────────────────────────────────────────
// Skill / action / quest seed content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical skill configuration — single source of truth for every trigger
 * item → skill mapping consumed by the runtime simulation.
 *
 * Each entry carries both:
 *   - `logicEventIds`  (compact array of handler keys, used by the Mongo schema)
 *   - `skills`         (expanded metadata with name, description, summoned entity)
 *
 * Consumers:
 *   - `bin/cyberia.js seed-skills` (upsert into the cyberia-skill collection, which is the
 *     authoritative store — an instance then runs the subset its own content triggers)
 *   - the fallback world, which has no collection to read
 */
export const DefaultSkillConfig = [
  {
    triggerItemId: 'atlas_pistol_mk2',
    logicEventIds: ['projectile'],
    skills: [
      {
        logicEventId: 'projectile',
        name: 'Projectile',
        description:
          'Fires a projectile in the direction of the tap. Spawn chance and lifetime scale with Intelligence and Range.',
        summonedEntityItemId: 'atlas_pistol_mk2_bullet',
      },
    ],
  },
  {
    triggerItemId: 'coin',
    logicEventIds: ['coin_drop_or_transaction'],
    skills: [
      {
        logicEventId: 'coin_drop_or_transaction',
        name: 'Coin Drop',
        description:
          'Coins are dropped automatically when an entity is killed. Transfer amount scales with kill percent rules.',
        summonedEntityItemId: 'coin',
      },
    ],
  },
  {
    triggerItemId: 'hatchet',
    logicEventIds: ['projectile'],
    skills: [
      {
        logicEventId: 'projectile',
        name: 'Projectile',
        description:
          'Fires a projectile in the direction of the tap. Spawn chance and lifetime scale with Intelligence and Range.',
        summonedEntityItemId: 'hatchet-skill',
      },
    ],
  },
];

// A logicEventId absent from the SharedDefaultsCyberia registry fails at boot.
for (const cfg of DefaultSkillConfig) {
  for (const logicEventId of [...(cfg.logicEventIds || []), ...(cfg.skills || []).map((sk) => sk.logicEventId)]) {
    if (!isCanonicalSkillLogicId(logicEventId)) {
      throw new Error(
        `DefaultSkillConfig: unknown skill logicEventId "${logicEventId}" for trigger "${cfg.triggerItemId}". ` +
          `Allowed (SharedDefaultsCyberia.SKILL_LOGIC_IDS): ${SKILL_LOGIC_ID_VALUES.join(', ')}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lain demo quests (testing only) — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
//
// No-prerequisite quests offered by Lain (15,22). These specs derive the quest
// definitions, their quest-talk dialogues, and Lain's questDialogueCodes map.
//
// Each `talk` objective needs its own quest-talk dialogue on the provider's
// action. The server validates a talk only against that mapping.

const LAIN_DEMO_QUEST_SPECS = [
  {
    suffix: 'coin-cache',
    title: 'Coin Cache',
    description: 'Lain is short on change. Round up some loose coins.',
    steps: [
      {
        id: 'step-collect-coins',
        description: 'Collect 3 coins from field drops.',
        objectives: [{ type: 'collect', itemId: 'coin', quantity: 3 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 10 }],
  },
  {
    suffix: 'timber-run',
    title: 'Timber Run',
    description: 'The camp stockpile is low. Bring back fresh wood.',
    talkLines: ['The reserve thanks you. That timber will hold the frame another cycle.'],
    steps: [
      {
        id: 'step-collect-wood',
        description: 'Gather 2 pieces of wood.',
        objectives: [{ type: 'collect', itemId: 'wood-drop-1', quantity: 2 }],
      },
      {
        id: 'step-return-lain',
        description: 'Deliver the wood to Lain.',
        objectives: [{ type: 'talk', itemId: 'lain', quantity: 1 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 15 }],
  },
  {
    suffix: 'pest-control',
    title: 'Pest Control',
    description: 'Kishins keep raiding the perimeter. Thin them out.',
    steps: [
      {
        id: 'step-kill-kishins',
        description: 'Defeat 3 Kishins.',
        objectives: [{ type: 'kill', itemId: 'kishins', quantity: 3 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 20 }],
  },
  {
    suffix: 'field-sweep',
    title: 'Field Sweep',
    description: 'A mixed patrol order: clear hostiles, then salvage the field.',
    talkLines: ['Patrol logged. The perimeter reads quiet — for now.'],
    steps: [
      {
        id: 'step-kill-one',
        description: 'Defeat 1 Kishin scout.',
        objectives: [{ type: 'kill', itemId: 'kishins', quantity: 1 }],
      },
      {
        id: 'step-salvage',
        description: 'Salvage 5 coins from the aftermath.',
        objectives: [{ type: 'collect', itemId: 'coin', quantity: 5 }],
      },
      {
        id: 'step-debrief-lain',
        description: 'Debrief with Lain.',
        objectives: [{ type: 'talk', itemId: 'lain', quantity: 1 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 25 }],
  },
  {
    suffix: 'lumber-reserve',
    title: 'Lumber Reserve',
    description: 'Stock the winter reserve before the next cycle.',
    steps: [
      {
        id: 'step-collect-wood',
        description: 'Gather 4 pieces of wood.',
        objectives: [{ type: 'collect', itemId: 'wood-drop-1', quantity: 4 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 30 }],
  },
  {
    suffix: 'proof-of-valor',
    title: 'Proof of Valor',
    description: 'Show Lain you can hold the line on your own.',
    talkLines: ['You held the line alone. The wired remembers that much.'],
    steps: [
      {
        id: 'step-kill-kishins',
        description: 'Defeat 5 Kishins.',
        objectives: [{ type: 'kill', itemId: 'kishins', quantity: 5 }],
      },
      {
        id: 'step-report-lain',
        description: 'Report your feat to Lain.',
        objectives: [{ type: 'talk', itemId: 'lain', quantity: 1 }],
      },
    ],
    rewards: [{ itemId: 'hatchet', quantity: 1 }],
  },
];

const lainDemoQuestCode = (suffix) => `lain-demo-${suffix}`;
const lainDemoTalkDialogCode = (suffix) => `quest-talk-lain-${suffix}`;

/** Demo specs carrying a `talk` objective targeting Lain — these need a mapping. */
const LAIN_DEMO_TALK_SPECS = LAIN_DEMO_QUEST_SPECS.filter((q) =>
  (q.steps || []).some((s) => (s.objectives || []).some((o) => o.type === 'talk' && o.itemId === 'lain')),
);

/** Dialogue seeds ({ code, order, speaker, text, mood }) the CLI writes to Mongo. */
export const DefaultCyberiaDialogues = [
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
  { code: 'default-kaneki', order: 1, speaker: 'Kaneki', text: 'What is 1000 minus 7?', mood: 'angry' },
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
  { code: 'default-ghost', order: 0, speaker: 'fragmentation', text: '...', mood: 'neutral' },
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
  { code: 'default-anon', order: 0, speaker: '???', text: 'You should not be here. Turn back.', mood: 'angry' },
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
  {
    code: 'talk-lain',
    order: 0,
    speaker: 'Lain',
    text: 'Present day... present time. You are here, so you are real.',
    mood: 'neutral',
  },
  {
    code: 'talk-lain',
    order: 1,
    speaker: 'Lain',
    text: 'There is nothing I can grant you. Only the wired remembers.',
    mood: 'neutral',
  },
  {
    code: 'quest-talk-wason-errand',
    order: 0,
    speaker: 'Wason',
    text: 'A small thing, friend — the field is littered with loose coin. Gather a few and bring them here.',
    mood: 'happy',
  },
  {
    code: 'quest-talk-wason-errand',
    order: 1,
    speaker: 'Wason',
    text: 'You have my thanks. A good hatchet for an honest errand.',
    mood: 'neutral',
  },
  {
    code: 'quest-talk-agent',
    order: 0,
    speaker: 'Agent',
    text: 'Civilian. There is a bounty if you have the stomach for it. Eliminate the threat, collect the drop, report back.',
    mood: 'neutral',
  },
  // One quest-talk dialogue per Lain demo quest that has a `talk` objective.
  ...LAIN_DEMO_TALK_SPECS.flatMap((q) =>
    (q.talkLines || [`Report received: ${q.title}.`]).map((text, order) => ({
      code: lainDemoTalkDialogCode(q.suffix),
      order,
      speaker: 'Lain',
      text,
      mood: 'neutral',
    })),
  ),
];

/**
 * Default action catalog — drives NPC interaction overlays and quest grants.
 * Each entry follows the `CyberiaAction` model schema.
 */
export const DefaultCyberiaActions = [
  // An action declares the capabilities available at a cell. `code` is a
  // location slug, `label` the bot's overhead name, and the NPC skin comes from
  // `dialogCode` (default-<skin>). `questDialogueCodes` maps a quest to its
  // dialogue. An NPC offers the quests whose source cell matches the action's.
  {
    code: 'loc-fallback-map-0-12-10',
    label: 'Wason',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 10,
    dialogCode: 'default-wason',
    questDialogueCodes: [
      { questCode: 'fallback-intro-quest', dialogCode: 'quest-talk-wason' },
      { questCode: 'wason-errand', dialogCode: 'quest-talk-wason-errand' },
      // bounty's report-back talk happens here too (bounty is offered at the agent cell).
      { questCode: 'bounty-quest-alpha', dialogCode: 'quest-talk-wason' },
    ],
  },
  {
    code: 'loc-fallback-map-0-18-10',
    label: 'Alex',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 18,
    sourceCellY: 10,
    dialogCode: 'default-alex',
    questDialogueCodes: [{ questCode: 'fallback-intro-quest', dialogCode: 'quest-talk-alex' }],
  },
  {
    code: 'loc-fallback-map-0-12-16',
    label: 'Agent',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 16,
    dialogCode: 'default-agent',
    questDialogueCodes: [{ questCode: 'bounty-quest-alpha', dialogCode: 'quest-talk-agent' }],
  },
  {
    // Shop capability: an action with shopItems is a vendor. The simulation
    // validates every purchase against this catalog (price item + quantity).
    code: 'loc-fallback-map-0-18-16',
    label: 'Punk',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 18,
    sourceCellY: 16,
    dialogCode: 'default-punk',
    shopItems: [{ itemId: 'tim-knife', priceItemId: 'coin', priceQty: 10 }],
  },
  {
    // Assembler capability: an action with craftRecipes is a fabrication
    // terminal. The simulation validates every synthesis against these recipes.
    // Every id here is obtainable in the fallback world with no seeding.
    code: 'loc-fallback-map-0-15-16',
    label: 'Eiri',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 15,
    sourceCellY: 16,
    dialogCode: 'default-eiri',
    craftRecipes: [
      {
        outputItems: [{ itemId: 'hatchet', qty: 1 }],
        ingredients: [
          { itemId: 'wood-drop-1', qty: 2 },
          { itemId: 'coin', qty: 5 },
        ],
        craftTimeMs: 3000,
      },
      {
        outputItems: [{ itemId: 'tim-knife', qty: 1 }],
        ingredients: [
          { itemId: 'wood-drop-2', qty: 1 },
          { itemId: 'wood-drop-1', qty: 1 },
          { itemId: 'coin', qty: 10 },
        ],
        craftTimeMs: 5000,
      },
      {
        // Multi-output salvage recipe: one blade breaks down into three stacks.
        outputItems: [
          { itemId: 'wood-drop-1', qty: 2 },
          { itemId: 'wood-drop-2', qty: 1 },
          { itemId: 'coin', qty: 5 },
        ],
        ingredients: [{ itemId: 'tim-knife', qty: 1 }],
        craftTimeMs: 2000,
      },
    ],
  },
  {
    // Storage capability: an action with storageSlots is a personal vault. The
    // simulation owns the contents; the slot count sizes the grid (25 → 5x5).
    code: 'loc-fallback-map-0-12-22',
    label: 'Kaneki',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 22,
    dialogCode: 'default-kaneki',
    storageSlots: 25,
  },
  {
    code: 'loc-fallback-map-0-15-22',
    label: 'Lain',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 15,
    sourceCellY: 22,
    dialogCode: 'default-lain',
    // One quest-talk dialogue per demo quest that carries a `talk` objective.
    questDialogueCodes: LAIN_DEMO_TALK_SPECS.map((q) => ({
      questCode: lainDemoQuestCode(q.suffix),
      dialogCode: lainDemoTalkDialogCode(q.suffix),
    })),
  },
];

/**
 * Default quest definitions for the fallback world. Mirrors `CyberiaQuest`
 * schema.  Objective types: 'talk' | 'collect' | 'kill'.
 */
export const DefaultCyberiaQuests = [
  {
    code: 'fallback-intro-quest',
    title: "The Wanderer's Task",
    description: 'Help Wason restore order to the fractured nodes.',
    // Spatial binding — must match the granting action `wason-quest-intro`.
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 10,
    prerequisiteCodes: [],
    unlocksQuestCodes: ['bounty-quest-alpha'],
    steps: [
      {
        id: 'step-talk-alex',
        description: 'Find Alex and hear her report on the portal anomalies.',
        objectives: [{ type: 'talk', itemId: 'alex', quantity: 1 }],
      },
      {
        id: 'step-collect-wood',
        description: 'Obtain a wood for Wason.',
        objectives: [{ type: 'collect', itemId: 'wood-drop-1', quantity: 1 }],
      },
      {
        id: 'step-kill-kishins',
        description: 'Eliminate Kishins anomalies threatening the trade routes.',
        objectives: [{ type: 'kill', itemId: 'kishins', quantity: 2 }],
      },
    ],
    rewards: [{ itemId: 'coin', quantity: 50 }],
  },
  {
    // Parallel initial mission: same source cell as the intro quest, no prerequisites.
    code: 'wason-errand',
    title: "Wason's Errand",
    description: 'Gather coins from the field and bring them back to Wason.',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 10,
    prerequisiteCodes: [],
    unlocksQuestCodes: [],
    steps: [
      {
        id: 'step-collect-coins',
        description: 'Collect 5 coins.',
        objectives: [{ type: 'collect', itemId: 'coin', quantity: 5 }],
      },
      {
        id: 'step-return-wason',
        description: 'Return to Wason.',
        objectives: [{ type: 'talk', itemId: 'wason', quantity: 1 }],
      },
    ],
    rewards: [{ itemId: 'hatchet', quantity: 1 }],
  },
  {
    code: 'bounty-quest-alpha',
    title: 'Alpha Bounty',
    description: 'A field test: eliminate a threat, claim your reward, then report back.',
    // Spatial binding — must match the granting action `agent-mission-brief`.
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 12,
    sourceCellY: 16,
    prerequisiteCodes: ['fallback-intro-quest'],
    unlocksQuestCodes: [],
    steps: [
      {
        id: 'step-kill-first',
        description: 'Eliminate the Kishins threat.',
        objectives: [{ type: 'kill', itemId: 'kishins', quantity: 1 }],
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
  // ── Demo quests (testing only) ─────────────────────────────────────────────
  // Derived from LAIN_DEMO_QUEST_SPECS.
  ...LAIN_DEMO_QUEST_SPECS.map((q) => ({
    code: lainDemoQuestCode(q.suffix),
    title: q.title,
    description: q.description,
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 15,
    sourceCellY: 22,
    prerequisiteCodes: [],
    unlocksQuestCodes: [],
    steps: q.steps,
    rewards: q.rewards,
  })),
];

// ─────────────────────────────────────────────────────────────────────────────
// Equipment rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which ObjectLayer item types may be active together on an entity. The server
 * validates every item_activation against these rules, scoped to the item set
 * of the entity state: liveItemIds while alive, deadItemIds while dead.
 */
export const EQUIPMENT_RULES_DEFAULTS = Object.freeze({
  activeItemTypes: [ITEM_TYPES.skin, ITEM_TYPES.breastplate, ITEM_TYPES.weapon],
  onePerType: true,
  requireSkin: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity Status Indicators (server-side numeric table)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Numeric Entity Status Indicator (ESI) IDs. The server stamps one u8 ID on
 * every entity in the AOI wire format; the client resolves the icon from
 * `SharedDefaultsCyberia.js#STATUS_ICONS_PRESENTATION`. These IDs are wire
 * contract: append only, never renumber.
 */
export const STATUS_ICONS = Object.freeze([
  { id: 0, name: 'none', description: 'No icon (skill/coin bots, world objects)' },
  { id: 1, name: 'passive', description: 'Passive bot — no weapon, non-aggressive' },
  { id: 2, name: 'hostile', description: 'Hostile bot — has weapon, will aggro' },
  { id: 3, name: 'frozen', description: 'Player in FrozenInteractionState (modal open)' },
  { id: 4, name: 'player', description: 'Normal player — alive, not frozen' },
  { id: 5, name: 'dead', description: 'Entity is dead / respawning' },
  { id: 6, name: 'resource', description: 'Resource entity — static, exploitable (wood, minerals, etc.)' },
  { id: 7, name: 'resource-extracted', description: 'Resource entity extracted/depleted (dead state)' },
  {
    id: 8,
    name: 'action-provider',
    description:
      'Capability: bot has a usable cyberia-action (shop/storage/craft/talk) for players who can interact with it. Sent as a capability bit, not a presence state.',
  },
  {
    id: 9,
    name: 'quest-provider',
    description:
      'Capability: bot offers or advances a cyberia-quest for the viewing player (acceptable offer or active talk-target). Sent as a capability bit, not a presence state.',
  },
  {
    id: 10,
    name: 'portal',
    description:
      'Presence: fixed-target portal / transport entity. The client renders the transport icon plus a "<targetMapCode> <x>,<y>" nameplate.',
  },
  {
    id: 11,
    name: 'portal-random',
    description:
      'Presence: random-target portal (inter-random / intra-random, targetCell -1,-1). The client renders the transport-random icon plus a "<targetMapCode>" nameplate (no cell, the destination is random).',
  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity-type defaults (simulation-side only — no presentation here)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resource entity variants. Each declares the live / extracted / drop item
 * triplet the simulation rotates through when a resource is depleted.
 */
export const RESOURCE_ENTITY_TYPE_DEFAULTS = Object.freeze([
  Object.freeze({
    entityType: ENTITY_TYPES.resource,
    liveItemIds: ['wood-1'],
    deadItemIds: ['wood-extracted-1'],
    dropItemIds: ['wood-drop-1'],
    inventoryItemsIds: [],
  }),
  Object.freeze({
    entityType: ENTITY_TYPES.resource,
    liveItemIds: ['wood-2'],
    deadItemIds: ['wood-extracted-2'],
    dropItemIds: ['wood-drop-2'],
    inventoryItemsIds: [],
  }),
]);

/** Convenience alias — first variant, used by single-resource fallbacks. */
export const RESOURCE_ENTITY_TYPE_DEFAULT = RESOURCE_ENTITY_TYPE_DEFAULTS[0];

/**
 * Canonical dead-state visual (Fragmentation). The server applies it when an
 * entity-type default declares no deadItemIds. Dead items are equippable only
 * while the entity is dead and are kept across deaths. This id stays out of
 * the player inventory wire; other dead items appear in it.
 */
export const DEFAULT_DEAD_ITEM_ID = 'fragmentation';

/**
 * Per-entity-type defaults the simulation consumes: live / dead / drop item IDs
 * and the seed inventory of a new entity.
 *
 * Field reference:
 *   entityType        — server-side category string.
 *   liveItemIds       — ObjectLayer item IDs while the entity is alive.
 *   deadItemIDs       — IDs swapped in on death / ghost state.
 *   dropItemIds       — IDs granted to the killer on resource depletion.
 *   inventoryItemsIds     — IDs the entity carries but never activates by lifecycle.
 *   overrideItemsIdsState — per-id overrides of what those lists derive.
 *
 * The three lifecycle lists are discriminators, not separate inventories: an entity holds one
 * inventory and the runtime activates the slots the context calls for. `inventoryItemsIds` is only
 * for what no lifecycle state ever activates — a coin balance, say. See
 * {@link resolveEntityInventory}, which is where that single inventory is derived.
 */
export const ENTITY_TYPE_DEFAULTS = Object.freeze([
  {
    entityType: ENTITY_TYPES.player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    inventoryItemsIds: ['coin'],
  },
  {
    entityType: ENTITY_TYPES.other_player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    inventoryItemsIds: ['coin'],
  },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['purple'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    inventoryItemsIds: ['coin'],
  },
  // Fallback-world mission givers, keyed by their active skin. `provider` bots
  // stay near their spawn and are immortal; `provider-static` bots do not move.
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['wason'], deadItemIds: [DEFAULT_DEAD_ITEM_ID], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['alex'], deadItemIds: [DEFAULT_DEAD_ITEM_ID], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['agent'], deadItemIds: [DEFAULT_DEAD_ITEM_ID], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['punk'], deadItemIds: [DEFAULT_DEAD_ITEM_ID], behavior: 'provider' },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['eiri'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    behavior: 'provider-static',
  },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['kaneki'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    behavior: 'provider-static',
  },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['lain'],
    deadItemIds: [DEFAULT_DEAD_ITEM_ID],
    behavior: 'provider-static',
  },
  {
    entityType: ENTITY_TYPES.skill,
    liveItemIds: ['atlas_pistol_mk2_bullet'],
    deadItemIds: [],
    inventoryItemsIds: [],
  },
  {
    entityType: ENTITY_TYPES.coin,
    liveItemIds: ['coin'],
    deadItemIds: [],
    inventoryItemsIds: [],
  },
  { entityType: ENTITY_TYPES.floor, liveItemIds: ['grass'], deadItemIds: [], dropItemIds: [], inventoryItemsIds: [] },
  { entityType: ENTITY_TYPES.obstacle, liveItemIds: [], deadItemIds: [], dropItemIds: [], inventoryItemsIds: [] },
  { entityType: ENTITY_TYPES.portal, liveItemIds: [], deadItemIds: [], dropItemIds: [], inventoryItemsIds: [] },
  { entityType: ENTITY_TYPES.foreground, liveItemIds: [], deadItemIds: [], dropItemIds: [], inventoryItemsIds: [] },
  // Static decorator — non-moving, passable, depth-sorted. Visuals come from the
  // map definition / world generator; no live/dead/drop rotation.
  { entityType: ENTITY_TYPES.static, liveItemIds: [], deadItemIds: [], dropItemIds: [], inventoryItemsIds: [] },
  ...RESOURCE_ENTITY_TYPE_DEFAULTS,
]);

/**
 * The default a placed entity resolves to, by the item ids it already carries.
 *
 * Mirrors `resolveEntityDefaultBuild` in cyberia-server/game/entity_defaults.go, which is the rule
 * the simulation applies at spawn: a default matches only when the entity carries ALL of its live
 * ids, and the most specific match wins — the one requiring the largest set, so `{purple, pistol}`
 * beats `{purple}`. Ties keep the earlier default, which makes the order a world declares them in
 * significant. With no containing match, the first default of that type answers.
 *
 * @param {{entityType: string, itemIds?: string[]}} entity - Placed entity type and its item ids.
 * @param {Array<{entityType: string, liveItemIds?: string[]}>} defaults - Candidate defaults, in order.
 * @returns {object|undefined} The matched default, or undefined when the type has none.
 */
export function resolveEntityDefaultBuild({ entityType, itemIds = [] }, defaults = []) {
  const carried = new Set(itemIds.filter(Boolean));
  let firstOfType;
  let matched;
  let matchedSize = 0;
  for (const candidate of defaults) {
    if (candidate?.entityType !== entityType) continue;
    firstOfType ??= candidate;
    const liveItemIds = candidate.liveItemIds || [];
    if (carried.size === 0 || liveItemIds.length === 0) continue;
    if (!liveItemIds.every((itemId) => carried.has(itemId))) continue;
    if (liveItemIds.length > matchedSize) {
      matched = candidate;
      matchedSize = liveItemIds.length;
    }
  }
  return matched ?? firstOfType;
}

/**
 * The canonical inventory contract: one entity, one inventory, derived.
 *
 * An entity carries the union of every item id its default names — the lifecycle discriminators
 * (live / dead / drop) and the inventory-only extras — deduplicated, in that order. Which slots
 * are *active* is not stored anywhere: it follows from the discriminator the id belongs to, and
 * the runtime flips them as context changes (`activateOrAppendLayer` in
 * cyberia-server/game/dead_items.go activates the slot that is already there). Seeding the whole
 * union is what lets it activate rather than append.
 *
 * Spawn state is alive, so the live ids are the active ones. A worn item and an inventory-only
 * item are stock the entity holds, so each starts as one unit. A dead or drop id is a lifecycle
 * slot the runtime activates or scatters later, so it starts empty. The server owns the coin
 * quantity from spawn on, whatever the seed says.
 *
 * `overrideItemsIdsState` adjusts that derivation for one carried id: `active` forces the spawn
 * state — a skin the equipment rules would otherwise leave inactive — and `quantity` sizes a
 * stack, which is how a drop bundle declares how many it scatters. It never adds an id: the union
 * decides membership, an override only what a member starts as, so a rule naming an id no list
 * carries does nothing at all.
 *
 * Activating one item can deactivate another. `EQUIPMENT_RULES_DEFAULTS` allows one active item
 * per type, so an override that activates a skin is a decision about which skin the entity wears:
 * the one the lists derived gives way to the one the author named. Only the governed types are
 * constrained, and only where the item's type is known — a resource visual, a coin, anything the
 * rules do not name, passes through untouched.
 *
 * @param {{liveItemIds?:string[],deadItemIds?:string[],dropItemIds?:string[],inventoryItemsIds?:string[],
 *   overrideItemsIdsState?:Array<{itemId:string,active?:boolean,quantity?:number}>}} entityDefault
 * @param {{itemTypes?:Object<string,string>|Map<string,string>}} [context] - itemId → item type, where known.
 * @returns {Array<{itemId:string,active:boolean,quantity:number}>} Inventory rows, as the wire carries them.
 */
export function resolveEntityInventory(entityDefault = {}, { itemTypes } = {}) {
  const live = new Set(entityDefault.liveItemIds || []);
  const overrides = new Map(
    (entityDefault.overrideItemsIdsState || []).filter((rule) => rule?.itemId).map((rule) => [rule.itemId, rule]),
  );
  const itemIds = [
    ...new Set(
      [
        ...(entityDefault.liveItemIds || []),
        ...(entityDefault.deadItemIds || []),
        ...(entityDefault.dropItemIds || []),
        ...(entityDefault.inventoryItemsIds || []),
      ].filter(Boolean),
    ),
  ];
  const drops = new Set(entityDefault.dropItemIds || []);
  const stock = new Set(entityDefault.inventoryItemsIds || []);
  const rows = itemIds.map((itemId) => {
    const override = overrides.get(itemId);
    const active = 'boolean' === typeof override?.active ? override.active : live.has(itemId);
    const held = active || stock.has(itemId);
    const quantity = Number.isFinite(override?.quantity) ? override.quantity : held ? 1 : 0;
    // A drop id scatters on death unless an override says how often. Rows that are not drops
    // carry the same 1, so every consumer reads one field and never a missing one.
    const dropChance =
      drops.has(itemId) && Number.isFinite(override?.dropChance)
        ? Math.min(1, Math.max(0, override.dropChance))
        : 1;
    return { itemId, active, quantity, dropChance };
  });
  return applyEquipmentRules(rows, { itemTypes, overrides });
}

/**
 * One active item per governed type, with the authored choice ahead of the derived one.
 *
 * An override that activates an item states which item of its type the entity wears; a row the
 * lists merely derived yields to it. Two overrides of the same type resolve in list order, first
 * kept — the same first-wins the runtime applies when it normalizes a loadout.
 *
 * @param {Array<{itemId:string,active:boolean,quantity:number}>} rows - Resolved inventory rows.
 * @param {{itemTypes?:Object<string,string>|Map<string,string>, overrides?:Map<string,object>}} context
 * @returns {Array<{itemId:string,active:boolean,quantity:number}>} The same rows, contested types settled.
 */
function applyEquipmentRules(rows, { itemTypes, overrides = new Map() } = {}) {
  if (!itemTypes || !EQUIPMENT_RULES_DEFAULTS.onePerType) return rows;
  const typeOf = (itemId) => (itemTypes instanceof Map ? itemTypes.get(itemId) : itemTypes[itemId]) || '';
  const governed = new Set(EQUIPMENT_RULES_DEFAULTS.activeItemTypes);
  const claimed = new Set();
  // Authored first, so an override wins the slot it asks for; the derived rows fill what is left.
  const contenders = [
    ...rows.filter((row) => row.active && overrides.get(row.itemId)?.active === true),
    ...rows.filter((row) => row.active && overrides.get(row.itemId)?.active !== true),
  ];
  const deactivated = new Set();
  for (const row of contenders) {
    const type = typeOf(row.itemId);
    if (!governed.has(type)) continue;
    if (claimed.has(type)) deactivated.add(row.itemId);
    else claimed.add(type);
  }
  // Taking something off does not take it away: the entity still carries the stack, so only the
  // worn flag changes. A row emptied here would leave the inventory holding nothing.
  return rows.map((row) => (deactivated.has(row.itemId) ? { ...row, active: false } : row));
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio seed content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The audio bank the seeded world needs: one `cyberia-audio` module per asset code.
 *
 * `bus` names the module directory (`cyberia-audio/src/audio-module/<bus-id>/<code>`) and is the
 * asset's natural route; `options` are that module's render parameters. The code is also the
 * identity the client fetches by, so a code here must exist as a module there.
 *
 * @type {ReadonlyArray<{code:string,bus:'music'|'sfx',options?:object}>}
 */
export const DEFAULT_AUDIO_BANK = Object.freeze([
  ...['shoot', 'coin', 'drop', 'item-pickup', 'victory', 'level-up', 'death', 'heal', 'hit', 'portal', 'ui-click', 'footsteps'].map(
    (code) => Object.freeze({ code, bus: AUDIO_BUS_SFX }),
  ),
  Object.freeze({ code: 'exploration', bus: AUDIO_BUS_MUSIC, options: { cycles: 1 } }),
  Object.freeze({ code: 'combat', bus: AUDIO_BUS_MUSIC, options: { rounds: 1 } }),
  Object.freeze({ code: 'boss', bus: AUDIO_BUS_MUSIC }),
  Object.freeze({ code: 'portal-cooldown', bus: AUDIO_BUS_MUSIC }),
  Object.freeze({ code: 'craft', bus: AUDIO_BUS_MUSIC }),
]);

/** Map-level audio settings the seed writes onto every seeded map. */
export const DEFAULT_AUDIO_SETTINGS = Object.freeze({ volume: 0.8, crossfadeMs: 800 });

/**
 * The music bed a seeded map falls back to when no event is holding the bus.
 *
 * One bed for every map of a world: what a map sounds like when nothing is happening is the
 * world's ambient identity, and the events are what make a place sound different — a combat or a
 * boss bed is bound to the moment it belongs to, not to a map index.
 */
export const DEFAULT_MAP_MUSIC = 'exploration';

/**
 * Canonical runtime-event → asset bindings.
 *
 * `logicEventId` is the semantic event the client emits (an audio LogicId, or a skill LogicId the
 * dispatcher runs); `audioCode` is the bank entry that answers it.
 *
 * @type {ReadonlyArray<{logicEventId:string,audioCode:string}>}
 */
export const DEFAULT_AUDIO_BINDINGS = Object.freeze([
  Object.freeze({ logicEventId: 'projectile', audioCode: 'shoot' }),
  Object.freeze({ logicEventId: 'coin_drop_or_transaction', audioCode: 'coin' }),
  Object.freeze({ logicEventId: 'drop', audioCode: 'drop' }),
  Object.freeze({ logicEventId: 'item-pickup', audioCode: 'item-pickup' }),
  Object.freeze({ logicEventId: 'craft', audioCode: 'craft' }),
  Object.freeze({ logicEventId: 'heal', audioCode: 'heal' }),
  Object.freeze({ logicEventId: 'hit', audioCode: 'hit' }),
  Object.freeze({ logicEventId: 'portal', audioCode: 'portal' }),
  Object.freeze({ logicEventId: 'ui-click', audioCode: 'ui-click' }),
  Object.freeze({ logicEventId: 'footsteps', audioCode: 'footsteps' }),
  Object.freeze({ logicEventId: 'combat', audioCode: 'combat' }),
  Object.freeze({ logicEventId: 'boss', audioCode: 'boss' }),
  Object.freeze({ logicEventId: 'victory', audioCode: 'victory' }),
  Object.freeze({ logicEventId: 'level-up', audioCode: 'level-up' }),
  Object.freeze({ logicEventId: 'death', audioCode: 'death' }),
  Object.freeze({ logicEventId: 'portal-cooldown', audioCode: 'portal-cooldown' }),
]);

const AUDIO_BANK_CODES = DEFAULT_AUDIO_BANK.map(({ code }) => code);

for (const { code, bus } of DEFAULT_AUDIO_BANK) {
  if (!AUDIO_BUSES.includes(bus)) {
    throw new Error(`DEFAULT_AUDIO_BANK: "${code}" names bus "${bus}". Allowed: ${AUDIO_BUSES.join(', ')}`);
  }
}

// Fail fast on an audio binding the runtime cannot honour: an unknown event would never fire, and
// an unbanked code would leave the client requesting an asset the seed never imported. Both read
// as silence at play time, so they must surface at boot instead.
for (const { logicEventId, audioCode } of DEFAULT_AUDIO_BINDINGS) {
  if (!isCanonicalAudioLogicId(logicEventId)) {
    throw new Error(
      `DEFAULT_AUDIO_BINDINGS: unknown logicEventId "${logicEventId}". ` +
        `Allowed (SharedDefaultsCyberia): ${[...AUDIO_LOGIC_ID_VALUES, ...SKILL_LOGIC_ID_VALUES].join(', ')}`,
    );
  }
  if (!AUDIO_BANK_CODES.includes(audioCode)) {
    throw new Error(
      `DEFAULT_AUDIO_BINDINGS: "${logicEventId}" binds audioCode "${audioCode}", ` +
        `absent from DEFAULT_AUDIO_BANK: ${AUDIO_BANK_CODES.join(', ')}`,
    );
  }
}
if (!AUDIO_BANK_CODES.includes(DEFAULT_MAP_MUSIC)) {
  throw new Error(`Default map music "${DEFAULT_MAP_MUSIC}" is absent from DEFAULT_AUDIO_BANK`);
}

/**
 * Expands {@link DEFAULT_AUDIO_BINDINGS} into `cyberia-map-audio-conf` event records.
 *
 * Routing is derived, not restated: an event's bus comes from the canonical audio registry
 * (a skill LogicId is a one-shot, so it falls back to sfx), music holds the bed in a loop unless
 * the binding is a one-shot cue, and only music crossfades.
 *
 * @param {{volume?:number,crossfadeMs?:number}} [settings=DEFAULT_AUDIO_SETTINGS]
 * @returns {Array<{logicEventId:string,audioCode:string,settings:object}>}
 */
export function buildAudioEventBindings(settings = DEFAULT_AUDIO_SETTINGS) {
  const { volume, crossfadeMs } = { ...DEFAULT_AUDIO_SETTINGS, ...settings };
  return DEFAULT_AUDIO_BINDINGS.map(({ logicEventId, audioCode }) => {
    const bus = AUDIO_LOGIC_ID_BUSES[logicEventId] ?? AUDIO_BUS_SFX;
    const music = AUDIO_BUS_MUSIC === bus;
    return {
      logicEventId,
      audioCode,
      settings: { bus, volume, loop: music, crossfadeMs: music ? crossfadeMs : 0 },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Player spawn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default player spawn policy, the shape of PlayerSpawnSchema. With `random`
 * false and `sourceMapCode` naming a loaded map, players spawn at
 * (sourceCellX, sourceCellY). Otherwise they spawn on a random walkable cell.
 */
export const DEFAULT_PLAYER_SPAWN = Object.freeze({
  sourceMapCode: 'fallback-map-0',
  sourceCellX: 3,
  sourceCellY: 3,
  random: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Instance-level simulation configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical default Cyberia instance configuration consumed by the gRPC
 * `InstanceConfig` payload. ONLY gameplay-affecting values live here.
 *
 * Anything that does not influence the authoritative simulation (cell-pixel
 * size, camera tunings, palette, interpolation window, render flags) is
 * forbidden — see `SharedDefaultsCyberia.js` and the
 * `/api/cyberia-client-hints` REST endpoint for presentation overrides.
 */
export const PROGRESSION_RULES_DEFAULTS = Object.freeze({
  maxLevel: 100,
  xpPerLevel: 100,
  baseStats: Object.freeze({ effect: 5, resistance: 10, agility: 0, range: 0, intelligence: 0, utility: 0 }),
  perLevelStats: Object.freeze({ effect: 2, resistance: 5, agility: 1, range: 10, intelligence: 1, utility: 1 }),
  killXp: 25,
  questXp: 100,
  objectiveXp: 10,
  minAwardIntervalMs: 500,
  repeatWindowMs: 60000,
  maxRepeatAwards: 4,
  maxAwardsPerWindow: 30,
  defaultBotLevel: 1,
});

export const PROGRESSION_RULE_LIMITS = Object.freeze(Object.fromEntries(Object.entries({
  maxLevel: [1, ENTITY_LEVEL_MAX], xpPerLevel: [1, 1000000],
  killXp: [0, 1000000], questXp: [0, 1000000], objectiveXp: [0, 1000000],
  minAwardIntervalMs: [1, 60000], repeatWindowMs: [1000, 3600000],
  maxRepeatAwards: [1, 100], maxAwardsPerWindow: [1, 1000], defaultBotLevel: [1, ENTITY_LEVEL_MAX],
}).map(([key, bounds]) => [key, Object.freeze(bounds)])));

export function resolveProgressionRules(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Progression rules must be an object.');
  const defaults = PROGRESSION_RULES_DEFAULTS;
  const rules = {
    ...defaults, ...input,
    baseStats: { ...defaults.baseStats, ...input.baseStats },
    perLevelStats: { ...defaults.perLevelStats, ...input.perLevelStats },
  };
  for (const key of ['baseStats', 'perLevelStats']) {
    if (input[key] !== undefined && (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key]))) {
      throw new TypeError('Base stat curve must be an object: ' + key);
    }
  }
  if (rules.defaultBotLevel > rules.maxLevel) throw new RangeError('Default bot level exceeds maximum level.');
  for (const [key, [min, max]] of Object.entries(PROGRESSION_RULE_LIMITS)) {
    if (!Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max) throw new RangeError('Invalid progression rule: ' + key);
  }
  for (const block of [rules.baseStats, rules.perLevelStats]) {
    for (const [key, value] of Object.entries(block)) {
      if (!STAT_TYPES.includes(key) || !Number.isInteger(value) || value < 0 || value > STAT_MODIFIER_MAX) {
        throw new RangeError('Invalid base stat curve: ' + key);
      }
    }
  }
  for (const key of Object.keys(rules)) {
    if (!(key in defaults)) throw new TypeError('Unknown progression rule: ' + key);
  }
  return rules;
}

export const CYBERIA_INSTANCE_CONF_DEFAULTS = {
  // ── Tick model ─────────────────────────────────────────────────────
  tickRate: 60,
  snapshotRate: 20,

  // ── World / AOI ────────────────────────────────────────────────────
  aoiRadius: 10,
  portalHoldTimeMs: 3000,
  portalSpawnRadius: 3,

  // ── Entity base stats ──────────────────────────────────────────────
  entityBaseSpeed: 5,
  entityBaseMaxLife: 100,
  entityBaseActionCooldownMs: 500,
  entityBaseMinActionCooldownMs: 100,

  // ── Bot defaults ───────────────────────────────────────────────────
  botAggroRange: 10,

  // ── Player defaults ────────────────────────────────────────────────
  defaultPlayerWidth: 2,
  defaultPlayerHeight: 2,
  playerBaseLifeRegenMin: 0.5,
  playerBaseLifeRegenMax: 1.5,
  // Movement speed for the player entity only, in grid cells per second. Bots,
  // projectiles and every other entity keep entityBaseSpeed. 0 falls back to
  // entityBaseSpeed.
  playerBaseSpeed: 8,
  progressionRules: PROGRESSION_RULES_DEFAULTS,
  maxActiveLayers: 4,
  initialLifeFraction: 1.0,

  // ── Combat / death ─────────────────────────────────────────────────
  respawnDurationMs: 3000,
  collisionLifeLoss: 10,

  // ── Economy — Fountain & Sink model ────────────────────────────────
  economyRules: {
    botSpawnCoins: 50,
    playerSpawnCoins: 50,
    coinKillPercentVsBot: 0.4,
    coinKillPercentVsPlayer: 0.15,
    coinKillMinAmount: 10,
    respawnCostPercent: 0.0,
    portalFee: 0,
    craftingFeePercent: 0.0,
  },

  // ── Chances, as fractions of 1 ───────────────────────────────────
  // A tap has lifeRegenChance to regenerate life; utility raises it. No chance the
  // stats raise passes maxChance, so nothing becomes a certainty.
  lifeRegenChance: 0.15,
  maxChance: 0.95,

  // ── Per-entity-type defaults ───────────────────────────────────────
  // References into the CyberiaEntityTypeDefault collection — see the schema.
  // Empty by default: a conf that names no document resolves against the
  // canonical ENTITY_TYPE_DEFAULTS above, so a fresh world is complete without
  // owning a single row.
  entityDefaults: [],

  // ── Status icons (numeric IDs only — visuals live in client defaults) ──
  statusIcons: STATUS_ICONS.map((s) => ({ ...s })),

  // ── Skill system ───────────────────────────────────────────────────
  // No skillConfig: the skills an instance runs are derived from its own content, never
  // stored on the conf. See DefaultSkillConfig above for the definitions and
  // cyberia-instance-items.js for the membership rule.
  skillRules: {
    projectileSpawnChance: 0.75,
    projectileLifetimeMs: 2000,
    projectileWidth: 1,
    projectileHeight: 1,
    projectileSpeedMultiplier: 3,
    doppelgangerSpawnChance: 0.6,
    doppelgangerLifetimeMs: 5000,
    doppelgangerSpawnRadius: 3,
    doppelgangerInitialLifeFraction: 1.0,
  },

  // ── Equipment Rules ────────────────────────────────────────────────
  equipmentRules: { ...EQUIPMENT_RULES_DEFAULTS },
};

// ─────────────────────────────────────────────────────────────────────────────
// Instance-conf default backfill
// ─────────────────────────────────────────────────────────────────────────────

const _isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const _cloneDefault = (v) => JSON.parse(JSON.stringify(v));

/**
 * Recursively backfill one value against its canonical default:
 *   - null / undefined  → deep clone of the default
 *   - empty array       → deep clone of the default (config lists must never
 *                         export empty — e.g. entityDefaults, statusIcons)
 *   - non-empty array   → kept verbatim (author content)
 *   - plain object      → keep author-set keys, recurse to fill missing default keys
 *   - scalar            → kept verbatim when present (0, '', false count as present)
 */
function _deepFillDefaults(value, defaultValue) {
  if (value === null || value === undefined) return _cloneDefault(defaultValue);
  if (Array.isArray(defaultValue)) {
    return Array.isArray(value) && value.length > 0 ? value : _cloneDefault(defaultValue);
  }
  if (_isPlainObject(defaultValue) && _isPlainObject(value)) {
    const out = { ...value };
    for (const key of Object.keys(defaultValue)) {
      out[key] = _deepFillDefaults(value[key], defaultValue[key]);
    }
    return out;
  }
  return value;
}

/**
 * Return a copy of a CyberiaInstanceConf document with every field defined by
 * CyberiaInstanceConfSchema present. Missing, null/undefined, or empty-array
 * fields — common when a doc is read with `.lean()` (which skips Mongoose schema
 * defaults), was created before a schema field existed, or was seeded with the
 * schema's empty-array default (e.g. `entityDefaults`) — are filled from
 * CYBERIA_INSTANCE_CONF_DEFAULTS, the same canonical values the fallback world
 * uses. Author-set scalars (including 0, '', false), non-empty arrays, and DB
 * metadata (_id, instanceCode, timestamps) are preserved untouched.
 *
 * @param {object} [conf]
 * @returns {object}
 */
export function fillInstanceConfDefaults(conf = {}) {
  const source = _isPlainObject(conf) ? conf : {};
  const out = { ...source };
  for (const key of Object.keys(CYBERIA_INSTANCE_CONF_DEFAULTS)) {
    out[key] = _deepFillDefaults(source[key], CYBERIA_INSTANCE_CONF_DEFAULTS[key]);
  }
  // A conf from before skills were derived still carries the field; it is not part of the
  // schema any more, and leaving it would put a stale second answer back on the wire.
  delete out.skillConfig;
  return out;
}
