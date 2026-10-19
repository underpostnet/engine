import { Schema, model } from 'mongoose';
import { PORTAL_MODES } from '../../client/components/cyberia/SharedDefaultsCyberia.js';

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

    // Transport behaviour of this edge:
    //   inter-portal  — teleport to a portal entity on another map
    //   inter-random  — teleport to a random walkable cell on another map
    //   intra-random  — teleport to a random walkable cell on the same map
    //   intra-portal  — teleport to a portal entity on the same map
    portalMode: {
      type: String,
      enum: PORTAL_MODES,
      default: 'inter-portal',
    },
  },
  { _id: false },
);

/**
 * Authoritative initial spawn position for new players joining this instance.
 * When `random` is false and `sourceMapCode` names a loaded map, players spawn at
 * (sourceCellX, sourceCellY) on it; otherwise (random true, or no/unknown map)
 * the server spawns them at a random walkable cell on a random map.
 */
const PlayerSpawnSchema = new Schema(
  {
    sourceMapCode: { type: String, trim: true },
    sourceCellX: { type: Number },
    sourceCellY: { type: Number },
    random: { type: Boolean, default: false },
  },
  { _id: false },
);

/** The cell of one map in the instance graph view. See LAYOUT_CELL_LIMIT. */
const MapLayoutCellSchema = new Schema(
  {
    mapCode: { type: String, required: true, trim: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * Graph container / instance.
 * The instance stores:
 * - nodes: cyberiaMapCodes[]
 * - edges: portals[]
 * - view: mapLayout[]
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

    // Saved cells of the graph view. A map without one takes the default cell.
    mapLayout: { type: [MapLayoutCellSchema], default: [] },

    // The preview the engine draws of the world, and the key of everything it shows (world-preview.js).
    preview: { type: Schema.Types.ObjectId, ref: 'File' },
    previewKey: { type: String, default: '' },

    // Authoritative initial spawn for new players (see PlayerSpawnSchema).
    playerSpawn: { type: PlayerSpawnSchema, default: () => ({}) },

    // Optional topology generation mode
    seed: { type: String, default: '' },
    topologyMode: {
      type: String,
      enum: ['manual', 'procedural', 'hybrid'],
      default: 'hybrid',
    },

    // Game server configuration (all tuning parameters live in a separate document).
    // Linked to CyberiaInstanceConf.instanceCode === this.code.
    conf: { type: Schema.Types.ObjectId, ref: 'CyberiaInstanceConf' },

    // Writes of this instance. A save names the revision it read, so no save overwrites a newer one.
    revision: { type: Number, default: 1, min: 1 },
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
