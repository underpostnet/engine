'use strict';

/**
 * @module node-capability.test
 * @description Proves the role boundary in both directions.
 *
 * The positive cases matter, but the negative ones are the point: a hub or a worker acquiring
 * cluster administration is the failure this table exists to prevent, and no test of what a role
 * *can* do would catch it.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import {
  CLUSTER_ADMIN_CAPABILITIES,
  NODE_CAPABILITIES,
  NODE_ROLES,
  assertRoleCapability,
  roleHasCapability,
} from '../../../../src/server/network/node-capability.js';
import { engineMirrorContentsFactory } from '../../../../src/server/ops/cron.js';

const readSource = (relative) => fs.readFileSync(new URL(`../../../../${relative}`, import.meta.url), 'utf8');

describe('node roles', () => {
  it('are exactly the four the topology defines', () => {
    expect(NODE_ROLES).to.deep.equal(['hub', 'control', 'worker', 'workstation']);
    for (const invented of ['control-plane', 'development', 'developer', 'incubation', 'edge', 'master', 'server'])
      expect(NODE_CAPABILITIES, invented).to.not.have.property(invented);
  });

  it('is the one vocabulary the edge identity validates against', () => {
    const wireguard = readSource('src/cli/wireguard.js');
    expect(wireguard).to.include('NODE_ROLES.includes(');
    expect(wireguard).to.not.include('EDGE_NODE_ROLES');
  });

  it('keeps every fleet member a WireGuard endpoint', () => {
    for (const role of NODE_ROLES.filter((entry) => roleHasCapability(entry, 'fleet-member')))
      expect(roleHasCapability(role, 'wireguard-hub') || roleHasCapability(role, 'wireguard-spoke'), role).to.equal(
        true,
      );
    expect(NODE_ROLES.filter((role) => roleHasCapability(role, 'fleet-member'))).to.deep.equal([
      'hub',
      'control',
      'worker',
    ]);
  });
});

describe('hub is the edge, not an administrator', () => {
  it('owns the edge capabilities', () => {
    for (const capability of ['wireguard-hub', 'haproxy', 'forward-proxy', 'edge-routing'])
      expect(roleHasCapability('hub', capability), capability).to.equal(true);
  });

  it('holds no cluster administration of any kind', () => {
    for (const capability of CLUSTER_ADMIN_CAPABILITIES)
      expect(roleHasCapability('hub', capability), capability).to.equal(false);
    // Not even a Kubernetes node: the hub is a VPS outside the cluster.
    expect(roleHasCapability('hub', 'kubernetes-node')).to.equal(false);
  });

  it('refuses a cluster operation explicitly rather than silently', () => {
    expect(() =>
      assertRoleCapability({ role: 'hub', capability: 'kubernetes-administration', operation: 'kubectl apply' }),
    ).to.throw("requires 'kubernetes-administration', which the 'hub' role does not hold");
  });
});

describe('control is the only administrator', () => {
  it('holds the cluster capabilities the platform gates on it', () => {
    for (const capability of [...CLUSTER_ADMIN_CAPABILITIES, 'event-service', 'wireguard-spoke'])
      expect(roleHasCapability('control', capability), capability).to.equal(true);
  });

  it('owns no edge capability', () => {
    for (const capability of ['haproxy', 'forward-proxy', 'wireguard-hub', 'edge-routing'])
      expect(roleHasCapability('control', capability), capability).to.equal(false);
  });

  it('performs a required cluster operation without refusal', () => {
    expect(() =>
      assertRoleCapability({
        role: 'control',
        capability: 'cron-publication',
        operation: 'cron --setup-start --apply',
      }),
    ).to.not.throw();
  });
});

describe('worker is a Kubernetes node, not a Kubernetes administrator', () => {
  it('keeps the runtime capabilities a cluster member needs', () => {
    for (const capability of ['kubernetes-node', 'wireguard-spoke', 'host-configuration'])
      expect(roleHasCapability('worker', capability), capability).to.equal(true);
  });

  it('holds no cluster administration, and no edge capability', () => {
    for (const capability of [...CLUSTER_ADMIN_CAPABILITIES, 'event-service', 'haproxy', 'forward-proxy'])
      expect(roleHasCapability('worker', capability), capability).to.equal(false);
  });

  it('refuses cron publication and HAProxy reconciliation', () => {
    for (const [capability, operation] of [
      ['cron-publication', 'cron --setup-start --apply'],
      ['cluster-secret-administration', 'secret apply'],
      ['haproxy', 'wireguard --haproxy-sync'],
    ])
      expect(() => assertRoleCapability({ role: 'worker', capability, operation }), capability).to.throw(
        'does not hold',
      );
  });
});

describe('workstation is a WireGuard peer, not a Kubernetes node', () => {
  it('holds only its own host and tunnel', () => {
    expect(NODE_CAPABILITIES.workstation).to.deep.equal(['host-configuration', 'wireguard-spoke']);
  });

  it('inherits nothing from the control node or a worker', () => {
    for (const capability of [
      ...CLUSTER_ADMIN_CAPABILITIES,
      'kubernetes-node',
      'fleet-member',
      'event-service',
      'baremetal-provisioning',
      'wireguard-hub',
      'haproxy',
      'forward-proxy',
      'edge-routing',
      'node-metrics',
    ])
      expect(roleHasCapability('workstation', capability), capability).to.equal(false);
  });

  it('refuses every operation the platform gates on another role', () => {
    for (const [capability, operation] of [
      ['haproxy', 'wireguard --haproxy-sync'],
      ['forward-proxy', 'wireguard --forward-proxy-server'],
      ['cron-publication', 'cron --apply'],
      ['event-service', 'event --service'],
      ['kubernetes-administration', 'kubectl apply'],
      ['cluster-secret-administration', 'secret apply'],
      ['baremetal-provisioning', 'baremetal'],
    ])
      expect(() => assertRoleCapability({ role: 'workstation', capability, operation }), capability).to.throw(
        "which the 'workstation' role does not hold",
      );
  });
});

describe('bare-metal provisioning is a capability of the control node', () => {
  it('belongs to the control node alone', () => {
    expect(NODE_ROLES.filter((role) => roleHasCapability(role, 'baremetal-provisioning'))).to.deep.equal(['control']);
  });

  it('is gated where the command executes, and leaves an unenrolled machine alone', () => {
    const baremetal = readSource('src/cli/baremetal.js');
    expect(baremetal).to.include('const role = Underpost.wireguard.localRole();');
    expect(baremetal).to.include("if (role) assertRoleCapability({ role, capability: 'baremetal-provisioning'");
  });
});

describe('capability is not inherited from the host domain', () => {
  it('gives every role host configuration and no role anything more for it', () => {
    // Being managed by `underpost host` is node-level operational configuration, and is not a
    // reason to hold cluster authority.
    for (const role of NODE_ROLES) expect(roleHasCapability(role, 'host-configuration'), role).to.equal(true);
    expect(NODE_ROLES.filter((role) => roleHasCapability(role, 'kubernetes-administration'))).to.deep.equal([
      'control',
    ]);
  });

  it('fails closed on a role the table does not define', () => {
    expect(roleHasCapability('control-plane', 'kubernetes-administration')).to.equal(false);
    expect(() => assertRoleCapability({ role: '', capability: 'kubernetes-node', operation: 'kubelet join' })).to.throw(
      'known roles are hub, control, worker, workstation',
    );
  });
});

describe('provisioning does not administer the cluster from a joining node', () => {
  // Regression: both node-setup scripts ran `secret --from-cron-env` before the role branch — a
  // removed flag, so it aborted bring-up under `set -e`, and a cluster Secret write attempted from
  // a worker. Secret administration belongs to the control node's reconciliation.
  it('leaves cluster Secret administration out of node bring-up', () => {
    for (const script of ['scripts/kubeadm-node-setup.sh', 'scripts/k3s-node-setup.sh']) {
      const source = readSource(script);
      expect(source, script).to.not.include('--from-cron-env');
      expect(source, script).to.not.match(/^\s*node bin secret\b/m);
    }
  });

  it('initializes the control plane only under the control role', () => {
    const source = readSource('scripts/kubeadm-node-setup.sh');
    expect(source).to.match(/if \[ "\$ROLE" = "control" \];[\s\S]*?cluster --dev --kubeadm/);
    // The worker path joins; it never initializes and never takes the admin conf.
    expect(source).to.match(/elif \[ "\$ROLE" = "worker" \][\s\S]*?worker_join/);
    expect(source).to.not.include('/etc/kubernetes/admin.conf');
  });

  it('ships no kubeconfig to the workload mirror', () => {
    const rules = engineMirrorContentsFactory().join(' ');
    for (const credential of ['admin.conf', 'kubeconfig', '.kube'])
      expect(rules, credential).to.not.include(credential);
  });
});

// Regression, found on the real hub: `cron --setup-start --git --apply` was not denied there. It
// ran, staged plaintext credentials under /dev/shm, and failed only because `kubectl` happened to
// be absent — defence by accident, not an authorization boundary.
describe('cron publication is gated where it executes', () => {
  const cronSource = readSource('src/server/ops/cron.js');

  it('gates the apply path, not manifest generation', () => {
    expect(cronSource).to.include("capability: 'cron-publication'");
    // The guard sits inside the apply branch: generating manifests stays offline and ungated.
    const applyIndex = cronSource.indexOf('if (options.apply) {');
    const guardIndex = cronSource.indexOf("capability: 'cron-publication'");
    expect(applyIndex).to.be.greaterThan(-1);
    expect(guardIndex).to.be.greaterThan(applyIndex);
  });

  it('leaves a machine with no node role alone, so CI keeps working', () => {
    expect(cronSource).to.include('const role = Underpost.wireguard.localRole();');
    expect(cronSource).to.include('if (role) assertRoleCapability(');
  });

  it('refuses publication from every role but control', () => {
    for (const role of ['hub', 'worker', 'workstation'])
      expect(
        () => assertRoleCapability({ role, capability: 'cron-publication', operation: 'cron --apply' }),
        role,
      ).to.throw('does not hold');
    expect(() =>
      assertRoleCapability({ role: 'control', capability: 'cron-publication', operation: 'cron --apply' }),
    ).to.not.throw();
  });
});
