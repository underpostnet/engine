'use strict';

import { expect } from 'chai';
import Underpost from '../../../../src/index.js';

// A control plane binds its node address into certificates and leases. The bring-up is stopped at
// the first host step after the binding, so the assertion is over the order, not the cluster.
describe('control plane address binding', () => {
  const STOP = new Error('stop after the address binding');
  let ensure;

  beforeEach(() => {
    vi.spyOn(Underpost.cluster, 'detectClusterRuntime').mockReturnValue({ type: null, ready: false });
    ensure = vi.spyOn(Underpost.dns, 'ensureStaticIpv4').mockResolvedValue({ supported: true, changed: false });
    for (const step of ['config', 'configMinimalK3s'])
      vi.spyOn(Underpost.cluster, step).mockImplementation(() => {
        throw STOP;
      });
  });

  afterEach(() => vi.restoreAllMocks());

  it('pins the address before a kubeadm or K3s control plane is configured', async () => {
    for (const runtime of [{ kubeadm: true }, { k3s: true }]) {
      ensure.mockClear();
      await expect(Underpost.cluster.init(undefined, runtime)).rejects.toBe(STOP);
      expect(ensure.mock.calls.length).to.equal(1);
    }
  });

  it('leaves a development or Kind host on its own network configuration', async () => {
    await expect(Underpost.cluster.init(undefined, { kubeadm: true, dev: true })).rejects.toBe(STOP);
    await expect(Underpost.cluster.init(undefined, {})).rejects.toBe(STOP);
    expect(ensure.mock.calls.length).to.equal(0);
  });
});
