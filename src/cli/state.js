/**
 * Container runtime state: the lifecycle status of one workload, written by
 * {@link UnderpostStartUp} as it moves through build, init and running, and read back by the
 * deployment monitor.
 *
 * Backed by its own store file, never the host root env store. The two have different lifetimes
 * and different owners: host configuration is provisioned onto a node and survives, while this
 * is per-container and resets with the container. Sharing one file meant a host operation could
 * erase a workload's status, and a status write could outlive the workload that produced it.
 * @module src/cli/state.js
 * @namespace UnderpostState
 */

import { dotenvStoreFactory } from './dotenv-store.js';
import { getUnderpostRootPath } from '../server/runtime/environment.js';
import fs from 'fs-extra';

/**
 * @class UnderpostState
 * @description Key-level access to the container runtime state store.
 * @memberof UnderpostState
 */
class UnderpostState {
  static API = {
    ...dotenvStoreFactory({
      path: () => `${getUnderpostRootPath()}/.state`,
      label: 'container state',
    }),

    /**
     * Whether this process runs inside a container, by Kubernetes service injection or Docker's
     * marker file. Lives here because every caller uses it to decide whether container runtime
     * state is worth recording.
     * @returns {boolean} True when running inside a container.
     * @memberof UnderpostState
     */
    isInsideContainer() {
      return !!process.env.KUBERNETES_SERVICE_HOST || fs.existsSync('/.dockerenv');
    },
  };
}

export default UnderpostState;
export { UnderpostState };
