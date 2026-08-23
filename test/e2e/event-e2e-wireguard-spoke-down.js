import Underpost from '../../src/index.js';

/**
 * End-to-end rehearsal for `wireguard-spoke-down`.
 *
 * Every peer of this node's hub is rehearsed, or those `--nodes` /
 * `--spoke` selects, one at a time. Each is taken down through the same
 * identity chain the remediation resolves — locally for the selected control
 * node, over LAN SSH for a worker — so a spoke that can be broken but not
 * repaired fails the rehearsal rather than an outage.
 *
 * @module test/event-e2e-wireguard-spoke-down.js
 */
export default {
  description: 'Stops WireGuard on each registered spoke, then verifies the repair of that spoke alone.',

  async subjects({ options }) {
    const hubAddress = Underpost.event.hubAddress();
    return Underpost.event.subjectSelection('spoke', options).map((spokeId) => {
      const spoke = Underpost.event.spokes().find((entry) => entry.id === spokeId);
      const target = Underpost.event.spokeTarget(spokeId);
      return {
        label: `spoke ${spokeId}`,
        // The local spoke is proved through the hub tunnel: its own 10.0.0.x stays
        // reachable on the machine itself even when the tunnel carries nothing.
        probes: [{ module: 'icmp', target: spoke.local ? hubAddress : spoke.address }],
        dispatchOptions: { spoke: spokeId },
        remote: { user: target.user, host: target.host },
      };
    });
  },

  async break(context, subject) {
    return await Underpost.event.runCommand('node bin wireguard --wireguard-stop', subject.remote);
  },

  async restore(context, subject) {
    return await Underpost.event.runCommand('node bin wireguard --wireguard-start', subject.remote);
  },
};
