/**
 * What each node role is allowed to do, as one table the rest of the platform reads.
 *
 * The roles are the three the topology already defines — `hub`, `control`, `worker` — and this
 * module adds no fourth. What it adds is a single answer to a question that was previously spread
 * across the commands that happened to ask it: `wireguard` knew HAProxy is hub-only, `event` knew
 * the dispatcher is control-only, and the sync steps knew cron publication is control-only, but
 * nothing stated the boundary those three agree on.
 *
 * The distinction the table exists to hold is between a Kubernetes **node** and a Kubernetes
 * **administrator**. A worker runs the kubelet and joins the cluster; that is node runtime, and it
 * is not permission to administer the cluster it belongs to. Being managed by the host domain is
 * not permission either — `underpost host` is node-level operational configuration, and every role
 * has it.
 *
 * @module src/server/network/node-capability.js
 * @namespace NodeCapability
 */

/**
 * @constant NODE_CAPABILITIES
 * @description Capabilities held by each role, derived from the operations the repository
 * actually gates: HAProxy and the forward proxy refuse to configure themselves off the hub, the
 * dispatcher refuses to install off a control node, and the sync sequence publishes CronJobs from
 * the control node alone.
 * @memberof NodeCapability
 */
const NODE_CAPABILITIES = Object.freeze({
  hub: Object.freeze([
    'host-configuration',
    'wireguard-hub',
    'haproxy',
    'forward-proxy',
    'edge-routing',
    'node-metrics',
  ]),
  control: Object.freeze([
    'host-configuration',
    'wireguard-spoke',
    'kubernetes-node',
    'kubernetes-administration',
    'cluster-secret-administration',
    'cron-publication',
    'event-service',
    'node-metrics',
  ]),
  worker: Object.freeze(['host-configuration', 'wireguard-spoke', 'kubernetes-node', 'node-metrics']),
});

/** The roles the topology defines. Ordered hub-first, as every fleet listing is. */
const NODE_ROLES = Object.freeze(Object.keys(NODE_CAPABILITIES));

/**
 * Capabilities that reach the Kubernetes API with cluster-wide authority.
 *
 * Named apart from the rest because they are the ones a role must never acquire by side effect:
 * possessing `kubectl`, joining the cluster, or carrying the host environment are each a reason
 * someone might assume these follow, and none of them is.
 * @memberof NodeCapability
 */
const CLUSTER_ADMIN_CAPABILITIES = Object.freeze([
  'kubernetes-administration',
  'cluster-secret-administration',
  'cron-publication',
]);

/**
 * Whether a role holds a capability.
 * @param {string} role - `hub`, `control` or `worker`.
 * @param {string} capability - Capability name.
 * @returns {boolean} True when the role holds it.
 * @memberof NodeCapability
 */
const roleHasCapability = (role, capability) => (NODE_CAPABILITIES[role] || []).includes(capability);

/**
 * Refuses an operation the role does not hold the capability for.
 *
 * Fail-closed on an unknown role as well as an unheld capability: a node whose document names a
 * role this table does not define has no capabilities, rather than the union of the ones it might
 * have meant.
 * @param {object} params - Assertion context.
 * @param {string} params.role - Role of the node the operation would run on.
 * @param {string} params.capability - Capability the operation requires.
 * @param {string} params.operation - Operation being attempted, named in the refusal.
 * @throws {Error} When the role does not hold the capability.
 * @memberof NodeCapability
 */
const assertRoleCapability = ({ role, capability, operation }) => {
  if (roleHasCapability(role, capability)) return;
  const held = NODE_CAPABILITIES[role];
  throw new Error(
    `[capability] ${operation} requires '${capability}', which the '${role || '(unset)'}' role does not hold; ` +
      (held ? `it holds ${held.join(', ')}` : `known roles are ${NODE_ROLES.join(', ')}`),
  );
};

export { CLUSTER_ADMIN_CAPABILITIES, NODE_CAPABILITIES, NODE_ROLES, assertRoleCapability, roleHasCapability };
