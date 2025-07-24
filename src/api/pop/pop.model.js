import { Schema, model, Types } from 'mongoose';

const PhysicalNodeSchema = new Schema(
  {
    hostname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      unique: true,
    },
    type: {
      type: String,
      enum: [
        'router', // Manages DHCP, NAT, and routes traffic between LAN and WAN. Core network component.
        'switch', // Connects devices within a local area network (Layer 2). High-speed Ethernet switching.
        'gateway', // Entry/exit point between networks; can overlap with router functionality.
        'controller', // Centralized control node, often for SDN (Software-Defined Networking).
        'storage', // Dedicated node for data persistence (NAS/SAN).
        'rack', // Physical infrastructure to mount servers and network devices.
        'edge-device', // Computing node placed close to the end-user to reduce latency (edge computing).
        'guest-node', // Temporary or virtualized compute unit used by external users or tenants.
        'firewall', // Filters and controls incoming/outgoing network traffic based on security rules.
        'power-unit', // Power supply hardware (UPS, PDU) ensuring uptime and power redundancy.
        'gpu', // Specialized hardware for parallel computing tasks (AI/ML workloads).
        'asic', // Custom hardware for specific operations like switching, encryption, or mining.
        'cooling-unit', // Environmental hardware responsible for temperature and airflow regulation.
      ],
      required: true,
    },
    commissionWorkflowId: {
      type: String,
      enum: ['hp-envy', 'rpi4mb'],
    },
    operators: [OperatorSchema],
  },
  {
    timestamps: true,
  },
);

const OperatorSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roles: [
      {
        type: String,
        enum: [
          'network-admin', // Full access to configure and manage all network systems
          'system-operator', // Handles routine operations, monitoring, basic config
          'support-tech', // Performs diagnostics and support with limited access
          'security-analyst', // Oversees and enforces cybersecurity measures
          'guest-operator', // Temporary or external operator with restricted permissions
          'auditor', // Can view logs and configurations but not modify
        ],
      },
    ],
  },
  { _id: false },
);

const ChangeLogSchema = new Schema(
  {
    changedAt: { type: Date, required: true },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description: { type: String },
  },
  { _id: false },
);

const PopSchema = new Schema(
  {
    popId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    // SAP-related fields.
    companyCode: {
      type: String,
      required: true,
    },
    plant: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: function (v) {
            return v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
          },
          message: 'Coordinates must be an array of two numbers [longitude, latitude]',
        },
      },
    },
    physicalNodes: [PhysicalNodeSchema],
    operators: [OperatorSchema],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    changeLog: [ChangeLogSchema],
  },
  {
    timestamps: true,
  },
);

const PopModel = model('Pop', PopSchema);
const ProviderSchema = PopSchema;

export { PopSchema, PopModel, ProviderSchema };
