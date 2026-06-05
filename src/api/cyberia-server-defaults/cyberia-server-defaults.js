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
 * `DefaultCyberiaItems` registry, `ENTITY_TYPE_TO_ITEM_TYPES`, quest /
 * action enums) lives in `SharedDefaultsCyberia.js`. This file
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
import { ITEM_TYPES, ENTITY_TYPES } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

// Re-export the shared vocabulary so existing server-side imports keep
// working without each consumer having to know which module owns which.
export {
  ITEM_TYPES,
  ENTITY_TYPES,
  ENTITY_TYPE_TO_ITEM_TYPES,
  QUEST_STEPS_TYPES,
  CYBERIA_ACTION_TYPES,
  DefaultCyberiaItems,
  getDefaultCyberiaItemById,
  getDefaultCyberiaItemsByItemType,
  getDefaultCyberiaItemsByEntityType,
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
 * Compact `triggerItemId → logicEventIds[]` table.  The engine expands each
 * entry into a richer skill record in CYBERIA_INSTANCE_CONF_DEFAULTS below.
 */
export const DefaultSkillConfig = [
  { triggerItemId: 'atlas_pistol_mk2', logicEventIds: ['projectile'] },
  { triggerItemId: 'coin', logicEventIds: ['coin_drop_or_transaction'] },
];

/**
 * Default dialogue seeds. Mirrors `CyberiaDialogue` model schema:
 *   { code, order, speaker, text, mood }
 *
 * Used by the seed/migration script to populate Mongo on first boot.
 */
export const DefaultCyberiaDialogues = [
  { code: 'default-coin', order: 0, speaker: 'Coin', text: 'A standard unit of exchange in the cyberia network.', mood: 'neutral' },
  { code: 'default-atlas_pistol_mk2', order: 0, speaker: 'Atlas Pistol MK2', text: 'Military-grade sidearm. Fires energy projectiles.', mood: 'neutral' },
  { code: 'default-atlas_pistol_mk2_bullet', order: 0, speaker: 'MK2 Bullet', text: 'High-velocity energy round. Dissipates on impact.', mood: 'neutral' },
  { code: 'default-hatchet', order: 0, speaker: 'Hatchet', text: 'A crude but reliable melee tool. Good for close quarters.', mood: 'neutral' },
  { code: 'default-wason', order: 0, speaker: 'Wason', text: 'They say I am just a wandering merchant... but I have seen things.', mood: 'neutral' },
  { code: 'default-wason', order: 1, speaker: 'Wason', text: 'The network was not always like this. There was a time before the portals.', mood: 'sad' },
  { code: 'default-scp-2040', order: 0, speaker: 'SCP-2040', text: 'CONTAINMENT PROTOCOL ACTIVE. Do not make direct eye contact.', mood: 'angry' },
  { code: 'default-scp-2040', order: 1, speaker: 'SCP-2040', text: 'I remember everything. Every iteration. Every reset.', mood: 'sad' },
  { code: 'default-purple', order: 0, speaker: 'Purple', text: 'The void between nodes is not empty — it is alive.', mood: 'neutral' },
  { code: 'default-punk', order: 0, speaker: 'Punk', text: 'Rules are just code someone else wrote. I write my own.', mood: 'happy' },
  { code: 'default-lain', order: 0, speaker: 'Lain', text: 'No matter where you go, everyone is connected.', mood: 'neutral' },
  { code: 'default-lain', order: 1, speaker: 'Lain', text: 'If you are not remembered, then you never existed.', mood: 'sad' },
  { code: 'default-lain', order: 2, speaker: 'Lain', text: 'The wired is not a separate world. It is layered over this one.', mood: 'neutral' },
  { code: 'default-kaneki', order: 0, speaker: 'Kaneki', text: 'I am not the protagonist of a novel. I am just... me.', mood: 'sad' },
  { code: 'default-kaneki', order: 1, speaker: 'Kaneki', text: 'What is 1000 minus 7?', mood: 'angry' },
  { code: 'default-junko', order: 0, speaker: 'Junko', text: 'Despair is the seed from which hope blooms!', mood: 'happy' },
  { code: 'default-junko', order: 1, speaker: 'Junko', text: 'How boring... nothing ever surprises me anymore.', mood: 'sad' },
  { code: 'default-ghost', order: 0, speaker: 'Ghost', text: '...', mood: 'neutral' },
  { code: 'default-eiri', order: 0, speaker: 'Eiri', text: 'I am the god of the wired. I designed the protocol.', mood: 'neutral' },
  { code: 'default-eiri', order: 1, speaker: 'Eiri', text: 'Flesh is just hardware. Consciousness is the only software that matters.', mood: 'neutral' },
  { code: 'default-anon', order: 0, speaker: '???', text: 'You should not be here. Turn back.', mood: 'angry' },
  { code: 'default-anon', order: 1, speaker: '???', text: 'Or stay. It does not matter. Nothing leaves this place.', mood: 'neutral' },
  { code: 'default-alex', order: 0, speaker: 'Alex', text: 'I have been mapping the portal network. Something does not add up.', mood: 'neutral' },
  { code: 'default-alex', order: 1, speaker: 'Alex', text: 'There are nodes that exist in the registry but have no physical anchor.', mood: 'neutral' },
  { code: 'default-agent', order: 0, speaker: 'Agent', text: 'Civilian, this area is restricted. State your business.', mood: 'neutral' },
  { code: 'default-agent', order: 1, speaker: 'Agent', text: 'Hmm. Proceed, but know that you are being watched.', mood: 'neutral' },
  { code: 'default-grass', order: 0, speaker: 'Grass', text: 'A patch of synthetic grass. It sways gently despite no wind.', mood: 'neutral' },
  { code: 'quest-talk-wason', order: 0, speaker: 'Wason', text: 'Wanderer! Glad you stopped by. I need a favor — nothing dangerous... mostly.', mood: 'happy' },
  { code: 'quest-talk-wason', order: 1, speaker: 'Wason', text: "First, find Alex — she's been surveying the nodes east of here. Then gather a hatchet for me.", mood: 'neutral' },
  { code: 'quest-talk-wason', order: 2, speaker: 'Wason', text: 'And one more thing: the SCP-2040 anomalies are overrunning my trade routes. Deal with two of them.', mood: 'sad' },
  { code: 'quest-talk-alex', order: 0, speaker: 'Alex', text: "Wason sent you? Good. The portal anomalies are getting worse. I've logged what I can.", mood: 'neutral' },
  { code: 'quest-talk-alex', order: 1, speaker: 'Alex', text: 'Tell Wason: the source is somewhere in the deeper nodes. The registry does not lie.', mood: 'neutral' },
  { code: 'talk-lain', order: 0, speaker: 'Lain', text: 'Present day... present time. You are here, so you are real.', mood: 'neutral' },
  { code: 'talk-lain', order: 1, speaker: 'Lain', text: 'There is nothing I can grant you. Only the wired remembers.', mood: 'neutral' },
];

/**
 * Default action catalog — drives NPC interaction overlays and quest grants.
 * Each entry follows the `CyberiaAction` model schema.
 */
export const DefaultCyberiaActions = [
  {
    code: 'wason-quest-intro', type: 'quest-talk', label: 'Quest',
    provideItemId: 'wason', grantQuestCode: 'fallback-intro-quest',
    dialogCode: 'quest-talk-wason', questDialogueCodes: ['quest-talk-wason'],
  },
  {
    code: 'alex-quest-talk', type: 'quest-talk', label: 'Quest Talk',
    provideItemId: 'alex', grantQuestCode: '',
    dialogCode: 'quest-talk-alex', questDialogueCodes: ['quest-talk-alex'],
  },
  {
    code: 'agent-mission-brief', type: 'quest-talk', label: 'Mission Brief',
    provideItemId: 'agent', grantQuestCode: 'bounty-quest-alpha',
    dialogCode: 'default-agent', questDialogueCodes: ['default-agent'],
  },
  {
    code: 'wason-bounty-brief', type: 'quest-talk', label: 'Bounty Brief',
    provideItemId: 'wason', grantQuestCode: '',
    dialogCode: 'quest-talk-wason', questDialogueCodes: ['quest-talk-wason'],
  },
  {
    code: 'lain-talk', type: 'talk', label: 'Talk',
    provideItemId: 'lain', grantQuestCode: '',
    dialogCode: 'talk-lain', questDialogueCodes: ['talk-lain'],
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
    prerequisiteCodes: [],
    unlocksQuestCodes: ['bounty-quest-alpha'],
    steps: [
      { id: 'step-talk-alex', description: 'Find Alex and hear her report on the portal anomalies.',
        objectives: [{ type: 'talk', itemId: 'alex', quantity: 1 }] },
      { id: 'step-collect-hatchet', description: 'Obtain a hatchet for Wason.',
        objectives: [{ type: 'collect', itemId: 'hatchet', quantity: 1 }] },
      { id: 'step-kill-scp', description: 'Eliminate SCP-2040 anomalies threatening the trade routes.',
        objectives: [{ type: 'kill', itemId: 'scp-2040', quantity: 2 }] },
    ],
    rewards: [{ itemId: 'coin', quantity: 50 }],
  },
  {
    code: 'bounty-quest-alpha',
    title: 'Alpha Bounty',
    description: 'A field test: eliminate a threat, claim your reward, then report back.',
    prerequisiteCodes: ['fallback-intro-quest'],
    unlocksQuestCodes: [],
    steps: [
      { id: 'step-kill-first', description: 'Eliminate the SCP-2040 threat.',
        objectives: [{ type: 'kill', itemId: 'scp-2040', quantity: 1 }] },
      { id: 'step-collect-reward', description: 'Collect the bounty coin drop.',
        objectives: [{ type: 'collect', itemId: 'coin', quantity: 10 }] },
      { id: 'step-report-wason', description: 'Report back to Wason.',
        objectives: [{ type: 'talk', itemId: 'wason', quantity: 1 }] },
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
  { id: 8, name: 'action-provider', description: 'Bot with available quest-talk/shop/storage/craft actions' },
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
  ...RESOURCE_ENTITY_TYPE_DEFAULTS,
]);

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
  skillConfig: [
    {
      triggerItemId: 'atlas_pistol_mk2',
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
      triggerItemId: 'anon',
      skills: [
        {
          logicEventId: 'doppelganger',
          name: 'Doppelganger',
          description:
            'Summons a passive clone of yourself that wanders nearby. Spawn chance scales with Intelligence.',
          summonedEntityItemId: '$active_skin',
        },
      ],
    },
    {
      triggerItemId: 'hatchet',
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
  ],

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
