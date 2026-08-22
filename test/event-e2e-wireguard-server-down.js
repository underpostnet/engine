import Underpost from '../src/index.js';

/**
 * End-to-end rehearsal for `wireguard-server-down`.
 *
 * Every registered hub is rehearsed, or those `--nodes` selects. A hub is
 * taken down the only way an operator can reach it while its tunnel is dead —
 * through the external SSH endpoint registered for it — which is also the path
 * the remediation must use. Stopping the interface any other way would not
 * exercise that dependency.
 *
 * @module test/event-e2e-wireguard-server-down.js
 */
export default {
  description: 'Stops WireGuard on each hub over its registered management SSH, then verifies the repair.',

  async subjects({ options }) {
    return Underpost.event.subjectSelection('hub', options).map((hubHost) => {
      const target = Underpost.event.hubTarget(hubHost);
      if (!target.address)
        throw new Error(`[event] the tunnel address of hub ${hubHost} is underivable; nothing can be probed`);
      return {
        label: `hub ${target.nodeName || hubHost}`,
        probes: [{ module: 'icmp', target: target.address }],
        dispatchOptions: { nodes: target.nodeName || hubHost },
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
