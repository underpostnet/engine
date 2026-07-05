/**
 * Canonical server-owned defaults for the Cyberia runtime.
 *
 * Single source of truth for everything the **authoritative simulation
 * server** (cyberia-server, Go) needs to build and run a world:
 *
 *   - per-entity-type live / dead / drop item configuration
 *   - simulation, AOI, combat, economy, and skill rules
 *   - equipment rules
 *   - status-icon **numeric IDs** (visuals live in client defaults)
 *   - seed content (dialogues, actions, quests) consumed by the
 *     persistence/CLI tooling that bootstraps the world
 *   - native-dependency pin list for chain-bridge tooling
 *
 * STRICT BOUNDARY
 * ---------------
 * NEVER imported from any file under `src/client/`. The browser bundler
 * resolves imports recursively, so a single browser-side import would drag
 * the entire simulation defaults into the public JS payload.
 *
 * Shared content **vocabulary** (item/entity type enums, the
 * `DefaultCyberiaItems` registry, `ENTITY_TYPE_TO_ITEM_TYPES`, the quest
 * step objective enum) lives in `SharedDefaultsCyberia.js`. This file
 * re-imports those so the browser editor never needs to reach into
 * server-defaults to learn the schema.
 *
 * Consumers:
 *   - cyberia-instance-conf model + grpc-server (gameplay config)
 *   - cyberia-world-generator / cyberia-fallback-world (world build)
 *   - cyberia-quest / cyberia-action / Mongo seed scripts (content)
 *   - bin/cyberia + bin/build + bin/deploy (CLI + chain bridge)
 *
 * @module src/api/cyberia-server-defaults/cyberia-server-defaults.js
 */

// The canonical client-defaults module lives under src/client/ so the
// browser bundler can resolve the URL inside the client tree. Engine-side
// Node imports work from any path, so we reach into it from here.
import {
  ITEM_TYPES,
  ENTITY_TYPES,
  SKILL_LOGIC_ID_VALUES,
  isCanonicalSkillLogicId,
} from '../../client/components/cyberia/SharedDefaultsCyberia.js';

/**
 * Native-dependency pin list. Consumed by `bin/build.js` and `bin/deploy.js`
 * when materialising the Cyberia subtree so versions stay reproducible
 * across CI / production deploys.
 */
export class CyberiaDependencies {
  static 'maxrects-packer' = '^2.7.3';
  static pngjs = '^7.0.0';
  static jimp = '^1.6.0';
  static sharp = '^0.34.5';
  static ethers = '~6.16.0';
}

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
 *   - `CYBERIA_INSTANCE_CONF_DEFAULTS.skillConfig` (gRPC fallback defaults)
 *   - `bin/cyberia.js seed-skills` (upsert into the cyberia-skill collection —
 *     the authoritative CyberiaSkill model keeps the full record, including the
 *     `skills` metadata the instance-conf skillConfig schema drops)
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
  // {
  //   triggerItemId: 'anon',
  //   logicEventIds: ['doppelganger'],
  //   skills: [
  //     {
  //       logicEventId: 'doppelganger',
  //       name: 'Doppelganger',
  //       description: 'Summons a passive clone of yourself that wanders nearby. Spawn chance scales with Intelligence.',
  //       summonedEntityItemId: '$active_skin',
  //     },
  //   ],
  // },
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

// Fail fast on a non-canonical logicEventId: the canonical LogicId registry in
// SharedDefaultsCyberia.js is the single source of truth, so a typo or a handler
// the dispatcher does not know must surface at boot, not as a silent no-op skill.
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

/**
 * Default dialogue seeds. Mirrors `CyberiaDialogue` model schema:
 *   { code, order, speaker, text, mood }
 *
 * Used by the seed/migration script to populate Mongo on first boot.
 */
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
];

/**
 * Default action catalog — drives NPC interaction overlays and quest grants.
 * Each entry follows the `CyberiaAction` model schema.
 */
export const DefaultCyberiaActions = [
  // An action has no `type`: it declares the capabilities available at a cell.
  // `code` is a generic location slug; `label` is the bot's overhead name (the
  // client fetches it by code via REST). The NPC skin is derived from
  // `dialogCode` (default-<skin>). `questDialogueCodes` maps each quest the NPC
  // handles to the dialogue shown for it (offer + talk-objective validation).
  // The quests an NPC OFFERS are those whose source cell matches the action's.
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
    code: 'loc-fallback-map-0-15-22',
    label: 'Lain',
    sourceMapCode: 'fallback-map-0',
    sourceCellX: 15,
    sourceCellY: 22,
    dialogCode: 'default-lain',
    questDialogueCodes: [],
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
    // Parallel initial mission — same source cell as Wason (12,10), no
    // prerequisites, so the player can accept it alongside the intro quest.
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
];

// ─────────────────────────────────────────────────────────────────────────────
// Equipment rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Governs which ObjectLayer item types may be simultaneously active on an
 * entity and enforces the one-per-type constraint.  The server validates
 * every item_activation request against these rules.
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
 * Numeric Entity Status Indicator (ESI) IDs.  The Go server stamps one of
 * these u8 IDs on every entity in the AOI binary wire format; the client
 * resolves the icon stem + border colour from its own presentation
 * defaults table (see `SharedDefaultsCyberia.js#STATUS_ICONS_PRESENTATION`).
 *
 * IDs MUST stay in sync with:
 *   cyberia-server/src/entity_status.go  (StatusNone … StatusResourceExtracted)
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
    defaultObjectLayers: [],
  }),
  Object.freeze({
    entityType: ENTITY_TYPES.resource,
    liveItemIds: ['wood-2'],
    deadItemIds: ['wood-extracted-2'],
    dropItemIds: ['wood-drop-2'],
    defaultObjectLayers: [],
  }),
]);

/** Convenience alias — first variant, used by single-resource fallbacks. */
export const RESOURCE_ENTITY_TYPE_DEFAULT = RESOURCE_ENTITY_TYPE_DEFAULTS[0];

/**
 * Per-entity-type defaults consumed by the Go server (live / dead / drop
 * item IDs and the seed inventory for newly spawned entities).
 *
 * Field reference:
 *   entityType            — server-side category string.
 *   liveItemIds           — ObjectLayer item IDs while the entity is alive.
 *   deadItemIds           — IDs swapped in on death / ghost state.
 *   dropItemIds           — IDs granted to the killer on resource depletion.
 *   defaultObjectLayers   — initial inventory rows ({itemId, active, qty}).
 */
export const ENTITY_TYPE_DEFAULTS = Object.freeze([
  {
    entityType: ENTITY_TYPES.player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    defaultObjectLayers: [
      { itemId: 'anon', active: true, quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true, quantity: 1 },
      { itemId: 'ghost', active: false, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  {
    entityType: ENTITY_TYPES.other_player,
    liveItemIds: ['anon', 'atlas_pistol_mk2'],
    deadItemIds: ['ghost'],
    defaultObjectLayers: [
      { itemId: 'anon', active: true, quantity: 1 },
      { itemId: 'atlas_pistol_mk2', active: true, quantity: 1 },
      { itemId: 'ghost', active: false, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  {
    entityType: ENTITY_TYPES.bot,
    liveItemIds: ['purple'],
    deadItemIds: ['ghost'],
    defaultObjectLayers: [
      { itemId: 'purple', active: true, quantity: 1 },
      { itemId: 'coin', active: false, quantity: 0 },
    ],
  },
  // Fallback-world mission/action givers. Resolved by their active skin (the
  // liveItemIds key), these bots take the canonical `provider` behavior: they
  // barely move from their spawn and are immortal. Lain only talks in place, so
  // she is fully static. Authors can retarget any of these via EntityEngineCyberia.
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['wason'], deadItemIds: ['ghost'], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['alex'], deadItemIds: ['ghost'], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['agent'], deadItemIds: ['ghost'], behavior: 'provider' },
  { entityType: ENTITY_TYPES.bot, liveItemIds: ['lain'], deadItemIds: ['ghost'], behavior: 'provider-static' },
  {
    entityType: ENTITY_TYPES.skill,
    liveItemIds: ['atlas_pistol_mk2_bullet'],
    deadItemIds: [],
    defaultObjectLayers: [{ itemId: 'atlas_pistol_mk2_bullet', active: true, quantity: 1 }],
  },
  {
    entityType: ENTITY_TYPES.coin,
    liveItemIds: ['coin'],
    deadItemIds: [],
    defaultObjectLayers: [{ itemId: 'coin', active: true, quantity: 1 }],
  },
  { entityType: ENTITY_TYPES.floor, liveItemIds: ['grass'], deadItemIds: [], dropItemIds: [], defaultObjectLayers: [] },
  { entityType: ENTITY_TYPES.obstacle, liveItemIds: [], deadItemIds: [], dropItemIds: [], defaultObjectLayers: [] },
  { entityType: ENTITY_TYPES.portal, liveItemIds: [], deadItemIds: [], dropItemIds: [], defaultObjectLayers: [] },
  { entityType: ENTITY_TYPES.foreground, liveItemIds: [], deadItemIds: [], dropItemIds: [], defaultObjectLayers: [] },
  // Static decorator — non-moving, passable, depth-sorted. Visuals come from the
  // map definition / world generator; no live/dead/drop rotation.
  { entityType: ENTITY_TYPES.static, liveItemIds: [], deadItemIds: [], dropItemIds: [], defaultObjectLayers: [] },
  ...RESOURCE_ENTITY_TYPE_DEFAULTS,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Player spawn
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical default player spawn policy. Mirrors PlayerSpawnSchema in
 * cyberia-instance.model.js and the Go PlayerSpawnConfig: when `random` is false
 * and `sourceMapCode` names a loaded map, new players spawn at
 * (sourceCellX, sourceCellY) on it; otherwise (random, or no/unknown map) they
 * spawn at a random walkable cell on a random map.
 *
 * The canonical default is a random spawn so a fresh or procedural world never
 * piles every new player onto a single cell.
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
export const CYBERIA_INSTANCE_CONF_DEFAULTS = {
  // ── Tick model ─────────────────────────────────────────────────────
  tickRate: 60,
  snapshotRate: 20,

  // ── World / AOI ────────────────────────────────────────────────────
  aoiRadius: 10,
  portalHoldTimeMs: 1000,
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
  sumStatsLimit: 500,
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

  // ── Regen ──────────────────────────────────────────────────────────
  lifeRegenChance: 300,
  maxChance: 10000,

  // ── Per-entity-type defaults ───────────────────────────────────────
  entityDefaults: ENTITY_TYPE_DEFAULTS.map((e) => ({ ...e })),

  // ── Status icons (numeric IDs only — visuals live in client defaults) ──
  statusIcons: STATUS_ICONS.map((s) => ({ ...s })),

  // ── Skill system ───────────────────────────────────────────────────
  // Canonical skill definitions live in DefaultSkillConfig above.
  // This reference is the single point of consumption for the gRPC
  // fallback defaults — any change goes through DefaultSkillConfig.
  skillConfig: DefaultSkillConfig,

  skillRules: {
    projectileSpawnChance: 0.5,
    projectileLifetimeMs: 2000,
    projectileWidth: 1,
    projectileHeight: 1,
    projectileSpeedMultiplier: 3,
    doppelgangerSpawnChance: 0.5,
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
 *                         export empty — e.g. skillConfig, entityDefaults)
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
 * Normalise a skillConfig array to the shape CyberiaInstanceConfSchema stores
 * (`SkillConfigEntrySchema` = { triggerItemId, logicEventIds }). The canonical
 * DefaultSkillConfig carries extra `skills` metadata the schema drops on write;
 * stripping it here keeps export ⇄ DB round-trips churn-free.
 */
function _normaliseSkillConfig(skillConfig) {
  if (!Array.isArray(skillConfig)) return [];
  return skillConfig.map((entry) => ({
    triggerItemId: entry.triggerItemId,
    logicEventIds: [...(entry.logicEventIds || [])],
  }));
}

/**
 * Return a copy of a CyberiaInstanceConf document with every field defined by
 * CyberiaInstanceConfSchema present. Missing, null/undefined, or empty-array
 * fields — common when a doc is read with `.lean()` (which skips Mongoose schema
 * defaults), was created before a schema field existed, or was seeded with the
 * schema's empty-array default (e.g. `skillConfig`) — are filled from
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
  out.skillConfig = _normaliseSkillConfig(out.skillConfig);
  return out;
}
