import Underpost from '../src/index.js';

/** The ports HAProxy publishes on the hub; blocking these takes every host down. */
const EDGE_PORTS = '80,443';

/**
 * End-to-end rehearsal for `public-ingress-down`.
 *
 * The outage is induced where the public edge actually terminates — the hub —
 * by blocking inbound traffic on the published ports. That is the one fault
 * that takes every host down at once, which is the condition this event
 * remediates; stopping a workload would produce the partial state the handler
 * deliberately refuses to act on.
 *
 * The block is scoped to those ports rather than to every port, because
 * remediation reaches the hub over SSH: a total ingress block would drop the
 * connection that repairs it and leave the edge unrecoverable from anywhere but
 * the provider console. `--unblock-all-ingress`, which the handler runs, clears
 * this block along with any other.
 *
 * @module test/event-e2e-public-ingress-down.js
 */
export default {
  description: 'Blocks public ingress on each hub, then verifies the edge is restored and every host answers again.',

  async subjects({ options }) {
    return Underpost.event.subjectSelection('hub', options).map((hubHost) => {
      const target = Underpost.event.hubTarget(hubHost);
      return {
        label: `ingress via ${target.nodeName || hubHost}`,
        probes: Underpost.event.publicIngressUrls().map((entry) => ({ module: 'http_2xx', target: entry.url })),
        dispatchOptions: { nodes: target.nodeName || hubHost },
        remote: { user: target.user, host: target.host },
      };
    });
  },

  async break(context, subject) {
    return await Underpost.event.runCommand(`node bin ip --block-ingress-port ${EDGE_PORTS}`, subject.remote);
  },

  async restore(context, subject) {
    return await Underpost.event.runCommand(`node bin ip --unblock-ingress-port ${EDGE_PORTS}`, subject.remote);
  },
};
