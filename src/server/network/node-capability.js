/**
 * What each node role is allowed to do, as one table the rest of the platform reads.
 *
 * A role is an infrastructure function and a trust boundary. It is not an environment and not an
 * application responsibility: a product derives its own permissions from the role and its
 * capabilities, and adds none to this table.
 *
 * The table separates three memberships that a machine can hold on its own: a WireGuard peer, a
 * Kubernetes node and a Kubernetes administrator. A worker runs the kubelet; that is not permission
 * to administer the cluster. A workstation is a WireGuard peer; that is not a Kubernetes node and
 * not a fleet member that the control node syncs or repairs.
 *
 * @module src/server/network/node-capability.js
 * @namespace NodeCapability
 */

/**
 * @constant NODE_CAPABILITIES
 * @description Capabilities held by each role, derived from the operations the repository gates:
 * - `host-configuration`: `underpost host` on the machine itself.
 * - `wireguard-hub`, `haproxy`, `forward-proxy`, `edge-routing`: the public edge.
 * - `wireguard-spoke`: a tunnel to a hub.
 * - `fleet-member`: the fleet syncs its checkout, probes its tunnel and repairs it over SSH.
 * - `kubernetes-node`: runs the kubelet and routes pod traffic into the tunnel.
 * - `kubernetes-administration`, `cluster-secret-administration`, `cron-publication`: cluster authority.
 * - `event-service`: the event dispatcher.
 * - `baremetal-provisioning`: the MAAS controller and machine commissioning on the host LAN.
 * - `node-metrics`: a host metrics collector that Prometheus scrapes.
 * @memberof NodeCapability
 */
const NODE_CAPABILITIES = Object.freeze({
  hub: Object.freeze([
    'host-configuration',
    'wireguard-hub',
    'haproxy',
    'forward-proxy',
    'edge-routing',
    'fleet-member',
    'node-metrics',
  ]),
  control: Object.freeze([
    'host-configuration',
    'wireguard-spoke',
    'fleet-member',
    'kubernetes-node',
    'kubernetes-administration',
    'cluster-secret-administration',
    'cron-publication',
    'event-service',
    'baremetal-provisioning',
    'node-metrics',
  ]),
  worker: Object.freeze(['host-configuration', 'wireguard-spoke', 'fleet-member', 'kubernetes-node', 'node-metrics']),
  workstation: Object.freeze(['host-configuration', 'wireguard-spoke']),
});

/** The roles the topology defines. Ordered hub-first, as every fleet listing is. */
const NODE_ROLES = Object.freeze(Object.keys(NODE_CAPABILITIES));

/**
 * Capabilities that reach the Kubernetes API with cluster-wide authority. No role acquires them by
 * side effect: holding `kubectl`, joining the cluster or reaching the tunnel grants none of them.
 * @memberof NodeCapability
 */
const CLUSTER_ADMIN_CAPABILITIES = Object.freeze([
  'kubernetes-administration',
  'cluster-secret-administration',
  'cron-publication',
]);

/**
 * Whether a role holds a capability.
 * @param {string} role - One of {@link NODE_ROLES}.
 * @param {string} capability - Capability name.
 * @returns {boolean} True when the role holds it; false for an unknown role.
 * @memberof NodeCapability
 */
const roleHasCapability = (role, capability) => (NODE_CAPABILITIES[role] || []).includes(capability);

/**
 * Refuses an operation the role does not hold the capability for. An unknown role holds nothing.
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
