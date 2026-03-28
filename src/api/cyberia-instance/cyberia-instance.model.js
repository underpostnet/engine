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
    code: { type: String, default: '', trim: true },

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
  },
  { timestamps: true },
);

/**
 * Indexes for fast adjacency lookups.
 * Useful for traversing the graph by source or target node.
 */
CyberiaInstanceSchema.index({ code: 1 });
CyberiaInstanceSchema.index({ 'portals.sourceMapCode': 1 });
CyberiaInstanceSchema.index({ 'portals.targetMapCode': 1 });

const CyberiaInstanceModel = model('CyberiaInstance', CyberiaInstanceSchema);

const ProviderSchema = CyberiaInstanceSchema;

export { CyberiaInstanceSchema, CyberiaInstanceModel, ProviderSchema };
