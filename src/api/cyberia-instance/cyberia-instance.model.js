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

    // Transport behaviour of this edge:
    //   inter-portal  — teleport to a portal entity on another map
    //   inter-random  — teleport to a random walkable cell on another map
    //   intra-random  — teleport to a random walkable cell on the same map
    //   intra-portal  — teleport to a portal entity on the same map
    portalMode: {
      type: String,
      enum: ['inter-portal', 'inter-random', 'intra-random', 'intra-portal'],
      default: 'inter-portal',
    },
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

    // Instance-level object layer item IDs.
    itemIds: { type: [String], default: [] },

    // Directed edge set of the graph
    portals: { type: [PortalEdgeSchema], default: [] },

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
