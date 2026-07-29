/**
 * CRI (Container Runtime Interface) endpoint resolution shared by every layer
 * that shells out to `crictl`: the cluster CLI, image management, and the
 * database bootstraps. Lives under `src/server` so the db layer can import it
 * without depending on the CLI god-object.
 * @module src/server/cri.js
 * @namespace CriEndpoint
 */

import { shellExec } from './process.js';

const CRIO_SOCKET_PATH = '/var/run/crio/crio.sock';

/**
 * @constant CRI_SOCKETS
 * @description The CRI endpoints this platform ever targets.
 * @memberof CriEndpoint
 */
const CRI_SOCKETS = {
  crio: `unix://${CRIO_SOCKET_PATH}`,
  containerd: 'unix:///run/containerd/containerd.sock',
  k3s: 'unix:///run/k3s/containerd/containerd.sock',
};

/**
 * @method resolveCriSocket
 * @description Resolves the CRI endpoint a `crictl` or `kubeadm` call should
 * target. K3s runs its own embedded containerd; a kubeadm host uses CRI-O only
 * while that socket actually exists, otherwise the host-level containerd.
 *
 * Detection is by socket presence, never by configuration, so a host whose
 * CRI-O install was removed or stopped still resolves to a runtime that answers.
 * @param {object} [options] - Resolution inputs.
 * @param {boolean} [options.k3s=false] - Whether the cluster is K3s-based.
 * @param {string} [options.criSocket] - Explicit endpoint override (highest precedence).
 * @returns {string} CRI endpoint URI.
 * @memberof CriEndpoint
 */
const resolveCriSocket = (options = {}) => {
  if (options?.criSocket) return options.criSocket;
  if (options?.k3s) return CRI_SOCKETS.k3s;
  const runtime = shellExec(`test -S ${CRIO_SOCKET_PATH} && echo crio || echo containerd`, {
    stdout: true,
    silent: true,
  }).trim();
  return runtime === 'crio' ? CRI_SOCKETS.crio : CRI_SOCKETS.containerd;
};

/**
 * @method crictlCommandFactory
 * @description Builds a `crictl` invocation pinned to the live CRI endpoint.
 *
 * Both `--runtime-endpoint` and `--image-endpoint` are passed. crictl resolves
 * the two independently, and `run install-crio` writes both into
 * `/etc/crictl.yaml` pointing at CRI-O; overriding only the runtime leaves image
 * operations (`pull`, `rmi`, `images`) validating a `crio.sock` that no longer
 * exists, which fails with "validate CRI v1 image API for endpoint".
 *
 * crictl is not on sudo's secure_path, hence the explicit PATH.
 * @param {string} args - crictl subcommand and arguments (e.g. `pull mongo:latest`).
 * @param {object} [options] - Forwarded to {@link CriEndpoint.resolveCriSocket}.
 * @returns {string} Full shell command.
 * @memberof CriEndpoint
 */
const crictlCommandFactory = (args, options = {}) => {
  const socket = resolveCriSocket(options);
  return `sudo env PATH="$PATH:/usr/local/bin:/usr/bin" crictl --runtime-endpoint ${socket} --image-endpoint ${socket} ${args}`;
};

export { CRI_SOCKETS, resolveCriSocket, crictlCommandFactory };
