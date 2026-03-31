import { Schema, model } from 'mongoose';

/**
 * Directed edge in a graph.
 * Each portal represents an adjacency relation:
 * source node -> target node
 */
const PortalEdgeSchema = new Schema(
  {
    // Origin node (graph source vertex)
    sourceMapCode: { type: String, required: true, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },

    // Destination node (graph target vertex)
    targetMapCode: { type: String, required: true, trim: true },
    targetCellX: { type: Number },
    targetCellY: { type: Number },
  },
  { _id: false },
);

/**
 * Graph container / instance.
 * The instance stores:
 * - nodes: cyberiaMapCodes[]
 * - edges: portals[]
 */
const CyberiaInstanceSchema = new Schema(
  {
    // Instance identifier
    code: { type: String, default: '', trim: true, unique: true },

    name: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'unlisted' },
    thumbnail: { type: Schema.Types.ObjectId, ref: 'File' },

    // Vertex set of the graph
    cyberiaMapCodes: { type: [String], default: [] },

    // Directed edge set of the graph
    portals: { type: [PortalEdgeSchema], default: [] },

    // Optional topology generation mode
    seed: { type: String, default: '' },
    topologyMode: {
      type: String,
      enum: ['manual', 'procedural', 'hybrid'],
      default: 'hybrid',
    },

    // Game server configuration — replaces all hardcoded Go defaults
    gameConfig: {
      type: new Schema(
        {
          // Rendering / camera
          cellSize: { type: Number },
          fps: { type: Number },
          interpolationMs: { type: Number },
          defaultObjWidth: { type: Number },
          defaultObjHeight: { type: Number },
          cameraSmoothing: { type: Number },
          cameraZoom: { type: Number },
          defaultWidthScreenFactor: { type: Number },
          defaultHeightScreenFactor: { type: Number },
          devUi: { type: Boolean },
          colors: {
            type: [
              new Schema(
                {
                  key: { type: String, required: true },
                  r: { type: Number, default: 0 },
                  g: { type: Number, default: 0 },
                  b: { type: Number, default: 0 },
                  a: { type: Number, default: 255 },
                },
                { _id: false },
              ),
            ],
            default: [],
          },

          // World / AOI
          aoiRadius: { type: Number },
          portalHoldTimeMs: { type: Number },
          portalSpawnRadius: { type: Number },

          // Entity base stats
          entityBaseSpeed: { type: Number },
          entityBaseMaxLife: { type: Number },
          entityBaseActionCooldownMs: { type: Number },
          entityBaseMinActionCooldownMs: { type: Number },

          // Bot defaults
          botAggroRange: { type: Number },

          // Player defaults
          defaultPlayerWidth: { type: Number },
          defaultPlayerHeight: { type: Number },
          playerBaseLifeRegenMin: { type: Number },
          playerBaseLifeRegenMax: { type: Number },
          sumStatsLimit: { type: Number },
          maxActiveLayers: { type: Number },
          initialLifeFraction: { type: Number },
          defaultPlayerObjectLayers: {
            type: [
              new Schema(
                {
                  itemId: { type: String, required: true },
                  active: { type: Boolean, default: false },
                  quantity: { type: Number, default: 1 },
                },
                { _id: false },
              ),
            ],
            default: [],
          },

          // Combat / death
          respawnDurationMs: { type: Number },
          ghostItemId: { type: String },
          collisionLifeLoss: { type: Number },

          // Economy
          coinItemId: { type: String },
          defaultCoinQuantity: { type: Number },

          // Regen
          lifeRegenChance: { type: Number },
          maxChance: { type: Number },

          // Skill rules — bullet and doppelganger tuning parameters
          skillRules: {
            type: new Schema(
              {
                bulletSpawnChance: { type: Number, default: 0 },
                bulletLifetimeMs: { type: Number, default: 0 },
                bulletWidth: { type: Number, default: 0 },
                bulletHeight: { type: Number, default: 0 },
                bulletSpeedMultiplier: { type: Number, default: 0 },
                doppelgangerSpawnChance: { type: Number, default: 0 },
                doppelgangerLifetimeMs: { type: Number, default: 0 },
                doppelgangerSpawnRadius: { type: Number, default: 0 },
                doppelgangerInitialLifeFraction: { type: Number, default: 0 },
              },
              { _id: false },
            ),
          },

          // Floor defaults
          defaultFloorItemId: { type: String },

          // Skill map
          skillConfig: {
            type: [
              new Schema(
                {
                  triggerItemId: { type: String, required: true },
                  spawnedItemIds: { type: [String], default: [] },
                  logicEventId: { type: String, default: '' },
                },
                { _id: false },
              ),
            ],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { timestamps: true },
);

/**
 * Indexes for fast adjacency lookups.
 * Useful for traversing the graph by source or target node.
 */
CyberiaInstanceSchema.index({ 'portals.sourceMapCode': 1 });
CyberiaInstanceSchema.index({ 'portals.targetMapCode': 1 });

const CyberiaInstanceModel = model('CyberiaInstance', CyberiaInstanceSchema);

const ProviderSchema = CyberiaInstanceSchema;

export { CyberiaInstanceSchema, CyberiaInstanceModel, ProviderSchema };
