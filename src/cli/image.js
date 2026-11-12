/**
 * Image management module for pull, build, creation of docker images and loading them into Kubernetes clusters
 * @module src/cli/image.js
 * @namespace UnderpostImage
 */

import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import crypto from 'crypto';
import { loggerFactory } from '../server/ops/logger.js';
import Underpost from '../index.js';
import { shellArgumentFactory, shellExec } from '../server/runtime/process.js';
import { CRI_SOCKETS, CRICTL_PRIVILEGE, crictlCommandFactory, resolveCriSocket } from '../server/ops/cri.js';
import { assertSourceRevision } from '../server/release/source-release.js';
import { stageCliPackage } from '../server/build/package.js';
import { parseList } from '../server/ops/cron.js';

const logger = loggerFactory(import.meta);

/**
 * The registry-qualified base images a Dockerfile pulls: no build stage, no `scratch`, no `$` reference.
 * @param {string} dockerfile - The Dockerfile text.
 * @returns {string[]}
 */
const dockerfileBaseImages = (dockerfile) => {
  const stages = new Set();
  const images = new Set();
  for (const line of dockerfile.split('\n')) {
    const match = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
    if (!match) continue;
    const [, image, stage] = match;
    if (!stages.has(image.toLowerCase()) && image !== 'scratch' && !image.includes('$')) {
      const segments = image.split('/');
      const hasRegistry = segments.length > 1 && /[.:]|^localhost$/.test(segments[0]);
      images.add(hasRegistry ? image : `docker.io/${segments.length > 1 ? image : `library/${image}`}`);
    }
    if (stage) stages.add(stage.toLowerCase());
  }
  return [...images];
};

/** Why a host-built image is copied into a node runtime with root. */
const IMAGE_LOAD_PRIVILEGE = 'copies an image archive into the store of a node runtime';

/** The node an image operation on a kind cluster acts on when none is named. */
const DEFAULT_KIND_NODE = 'kind-worker';

/**
 * The command that imports an image archive into the store a CRI reads; `-` reads it from stdin. CRI-O
 * reads root Podman's storage, and containerd keeps the digests of the archive.
 * @param {string} criSocket - One of {@link CRI_SOCKETS}.
 * @param {string} [archive='-']
 * @returns {string}
 */
const imageImportCommandFactory = (criSocket, archive = '-') => {
  const source = archive === '-' ? '-' : shellArgumentFactory(archive);
  if (criSocket === CRI_SOCKETS.crio) return archive === '-' ? 'podman load' : `podman load -i ${source}`;
  if (criSocket === CRI_SOCKETS.k3s) return `k3s ctr images import ${source}`;
  return `ctr -n k8s.io images import --digests ${source}`;
};

/**
 * Loads an image archive into a kubeadm node's runtime.
 * @param {string} tarFile
 */
const kubeadmImport = (tarFile) => shellExec(`sudo ${imageImportCommandFactory(resolveCriSocket(), tarFile)}`);

/**
 * The last path segment of an image repository: `localhost/cyberia-server:tag` gives `cyberia-server`.
 * @param {string} reference
 * @returns {string}
 */
const repositoryNameFactory = (reference) =>
  `${reference || ''}`
    .replace(/@sha256:[0-9a-f]+$/, '')
    .replace(/:[^/:]+$/, '')
    .split('/')
    .pop();

/**
 * The container runtime of this host: it reads the store a build here writes.
 * @param {{k3s?:boolean}} [cluster]
 * @returns {{node:string, local:boolean, run:(command:string)=>string, criSocket:string}}
 */
const hostRuntimeFactory = ({ k3s = false } = {}) => ({
  node: os.hostname(),
  local: true,
  run: (command) => command,
  criSocket: resolveCriSocket({ k3s }),
});

/**
 * How this host drives the container runtime of a Kubernetes node: in a kind node container, or through
 * the node identity of `deploy/nodes`, here or on its peer over SSH.
 * @param {string} node - A Kubernetes node name.
 * @param {{kind?:boolean, k3s?:boolean, sshKeyPath?:string}} [cluster] - `sshKeyPath` replaces the key of the peer.
 * @returns {{node:string, local:boolean, run:(command:string)=>string, criSocket:string}}
 */
const nodeRuntimeFactory = (node, { kind = false, k3s = false, sshKeyPath = '' } = {}) => {
  if (kind)
    return {
      node,
      local: false,
      run: (command) => `docker exec -i ${shellArgumentFactory(node)} sh -c ${shellArgumentFactory(command)}`,
      criSocket: CRI_SOCKETS.containerd,
    };
  const target = Underpost.event.kubernetesNodeTarget(node);
  if (target.via === 'local') return { ...hostRuntimeFactory({ k3s }), node };
  const run = (command) =>
    Underpost.ssh.rootSshCommandFactory({ ...target, keyPath: sshKeyPath || target.keyPath }, command);
  return { node, local: false, run, criSocket: resolveCriSocket({ k3s, run }) };
};

/**
 * The node runtimes an image operation acts on: those of `nodes`, else the default node of the cluster,
 * {@link DEFAULT_KIND_NODE} for kind and this host otherwise.
 * @param {{nodes?:string|string[], kind?:boolean, k3s?:boolean, sshKeyPath?:string}} [selection]
 * @returns {Array<ReturnType<typeof nodeRuntimeFactory>>}
 */
const nodeRuntimesFactory = ({ nodes, kind = false, k3s = false, sshKeyPath = '' } = {}) => {
  const names = parseList(nodes);
  if (names.length) return names.map((node) => nodeRuntimeFactory(node, { kind, k3s, sshKeyPath }));
  return [kind ? nodeRuntimeFactory(DEFAULT_KIND_NODE, { kind }) : hostRuntimeFactory({ k3s })];
};

/**
 * Runs `crictl` against the CRI of a node runtime.
 * @param {{run:(command:string)=>string, criSocket:string}} runtime
 * @param {string} args
 * @param {object} [options] - Forwarded to `shellExec`.
 * @returns {*} The `shellExec` result.
 */
const crictl = ({ run, criSocket }, args, options = {}) =>
  shellExec(run(crictlCommandFactory(args, { criSocket })), { privileged: CRICTL_PRIVILEGE, ...options });

/**
 * The status a node runtime reports for an image reference.
 * @param {{run:(command:string)=>string, criSocket:string}} runtime
 * @param {string} reference
 * @returns {object|null} `null` when the runtime holds no such image.
 */
const inspectImage = (runtime, reference) => {
  const result = crictl(runtime, `inspecti -o json ${shellArgumentFactory(reference)}`, {
    silent: true,
    disableLog: true,
    silentOnError: true,
  });
  return result.code === 0 ? JSON.parse(result.stdout).status : null;
};

/**
 * The digest of an image reference that every node runtime resolves. One archive gives the same digest in
 * every store that loads it, and no load keeps the digest of the build.
 * @param {Array<{node:string, run:(command:string)=>string, criSocket:string}>} runtimes
 * @param {string} reference
 * @returns {string} `<repository>@sha256:<digest>`.
 * @throws {Error} When the runtimes share no digest.
 */
const sharedDigest = (runtimes, reference) => {
  const name = repositoryNameFactory(reference);
  const [digest] = runtimes
    .map((runtime) =>
      (inspectImage(runtime, reference)?.repoDigests ?? []).filter((entry) => entry.includes(`${name}@sha256:`)),
    )
    .reduce((shared, digests) => shared.filter((entry) => digests.includes(entry)));
  if (!digest)
    throw new Error(`No digest of ${reference} resolves on every node: ${runtimes.map(({ node }) => node).join(', ')}`);
  console.log(digest);
  return digest;
};

/**
 * Pulls an image reference into each node runtime.
 * @param {Array<{run:(command:string)=>string, criSocket:string}>} runtimes
 * @param {string} reference
 */
const pullImage = (runtimes, reference) => {
  for (const runtime of runtimes) crictl(runtime, `pull ${shellArgumentFactory(reference)}`);
};

/**
 * Streams one image archive into each node runtime.
 * @param {Array<{node:string, run:(command:string)=>string, criSocket:string}>} runtimes
 * @param {string} source - A command that writes the archive to stdout.
 */
const loadImage = (runtimes, source) => {
  for (const runtime of runtimes) {
    logger.info('Loading the image into its node', { source, node: runtime.node });
    shellExec(`${source} | ${runtime.run(imageImportCommandFactory(runtime.criSocket))}`, {
      privileged: IMAGE_LOAD_PRIVILEGE,
    });
  }
};

/**
 * Parses the table `crictl images` prints into one object per row, keyed by its column heads.
 * @param {string} raw
 * @returns {Array<object>}
 */
const crictlTableFactory = (raw) => {
  const [head = '', ...rows] = `${raw}`.split('\n');
  // The `IMAGE ID` head splits into a second `IMAGE`, which names no column of its own.
  const heads = [...new Set(head.split(' ').filter((cell) => cell.trim()))];
  return rows
    .map((row) => row.split(' ').filter((cell) => cell.trim()))
    .filter((cells) => cells.length > 0)
    .map((cells) => Object.fromEntries(heads.map((name, index) => [name, cells[index]])));
};

/**
 * @class UnderpostImage
 * @description Manages Docker image operations, including pulling, building, and loading images into Kubernetes clusters.
 * Each operation on a node runtime acts on the nodes `--nodes` names, reached through their node identity.
 * @memberof UnderpostImage
 */
class UnderpostImage {
  static API = {
    /**
     * @method pullBaseImages
     * @description Ensures the base image prerequisites for the runtime Dockerfiles
     * are present on the host (currently `docker.io/rockylinux/rockylinux:9`). This
     * only pulls — it does NOT build. A build pulls the other bases of its own Dockerfile.
     * @memberof UnderpostImage
     */
    pullBaseImages() {
      shellExec(`sudo podman pull docker.io/rockylinux/rockylinux:9`);
    },
    /**
     * @method pullDockerfileBaseImages
     * @description Pulls each base image of a Dockerfile that root Podman does not hold.
     * Builds run with `--pull=never`, so every base must exist locally.
     * @param {string} dockerfilePath - The Dockerfile to read.
     * @memberof UnderpostImage
     */
    pullDockerfileBaseImages(dockerfilePath) {
      if (!fs.existsSync(dockerfilePath)) return;
      for (const image of dockerfileBaseImages(fs.readFileSync(dockerfilePath, 'utf8'))) {
        const quoted = shellArgumentFactory(image);
        const held = shellExec(`sudo podman image exists ${quoted}`, { silent: true, silentOnError: true });
        if (held.code !== 0) shellExec(`sudo podman pull ${quoted}`);
      }
    },
    /**
     * @method build
     * @description Builds a Docker image using Podman, optionally saves it as a tar archive,
     * and loads it into a specified target (Kind, Kubeadm, or K3s cluster, or the local
     * Docker store for Docker Compose).
     * @param {object} options - Options for building and loading images.
     * @param {string} [options.path=''] - The path to the directory containing the Dockerfile.
     * @param {string} [options.imageName=''] - The name and tag for the image (e.g., 'my-app:latest').
     * @param {string} [options.version=''] - Version tag for the image.
     * @param {string} [options.imageOutPath=''] - Directory to save the image tar file.
     * @param {string} [options.dockerfileName=''] - Name of the Dockerfile (defaults to 'Dockerfile').
     * @param {string} [options.target=''] - The build stage to stop at, for a multi-stage Dockerfile.
     * @param {boolean} [options.podmanSave=false] - If true, save the image as a tar archive using Podman.
     * @param {boolean} [options.kind=false] - If true, load the image archive into a Kind cluster.
     * @param {boolean} [options.kubeadm=false] - If true, load the image into the Kubeadm node runtime (CRI-O or containerd).
     * @param {boolean} [options.k3s=false] - If true, load the image archive into a K3s cluster (uses 'k3s ctr').
     * @param {boolean} [options.dockerCompose=false] - If true, load the image archive into the local Docker store for Docker Compose.
     * @param {boolean} [options.reset=false] - If true, perform a no-cache build.
     * @param {boolean} [options.dev=false] - If true, use development mode.
     * @memberof UnderpostImage
     */
    build(
      options = {
        path: '',
        imageName: '',
        version: '',
        imageOutPath: '',
        dockerfileName: '',
        target: '',
        podmanSave: false,
        kind: false,
        kubeadm: false,
        k3s: false,
        dockerCompose: false,
        reset: false,
        dev: false,
      },
    ) {
      let {
        path,
        imageName,
        version,
        imageOutPath,
        dockerfileName,
        target,
        podmanSave,
        kind,
        kubeadm,
        k3s,
        dockerCompose,
        reset,
        dev,
      } = options;
      if (!path) path = '.';
      if (!imageName) imageName = `rockylinux9-underpost:${Underpost.version}`;
      if (!imageOutPath) imageOutPath = '.';
      if (imageName.match('/')) imageName = imageName.split('/')[1];
      if (!version) version = 'latest';
      version = imageName && imageName.match(':') ? '' : `:${version}`;
      const podManImg = `localhost/${imageName}${version}`;
      if (imageOutPath && typeof imageOutPath === 'string' && !fs.existsSync(imageOutPath))
        fs.mkdirSync(imageOutPath, { recursive: true });
      const tarFile = `${imageOutPath}/${imageName.replace(':', '_')}.tar`;
      let cache = '';
      if (reset === true) cache += ' --rm --no-cache';

      // Forward GitHub credentials from the host environment into the build as
      // podman/BuildKit secrets (`--secret id=...,src=...`), matching the
      // `RUN --mount=type=secret,id=github_*` contract in the runtime
      // Dockerfiles (e.g. src/runtime/engine-cyberia). Secrets are written to
      // short-lived 0600 temp files and removed right after the build — they are
      // never passed as build-args (which would persist in image history) nor
      // baked into any layer.
      const secretTmpFiles = [];
      const secretFlags = [];
      const addBuildSecret = (id, value) => {
        if (!value) return;
        const file = nodePath.join(os.tmpdir(), `underpost-secret-${id}-${crypto.randomBytes(6).toString('hex')}`);
        fs.writeFileSync(file, String(value), { mode: 0o600 });
        secretTmpFiles.push(file);
        secretFlags.push(`--secret ${shellArgumentFactory(`id=${id},src=${file}`)}`);
      };
      // addBuildSecret('github_token', process.env.GITHUB_TOKEN);
      addBuildSecret('github_username', process.env.GITHUB_USERNAME);
      // Build secrets are created dynamically: each `RUN --mount=type=secret,id=<x>`
      // id maps to a host env var; only the ones actually set are passed, so a
      // Dockerfile that omits (or comments out) a mount just never sees it. Extend
      // this map — plus a merge of any caller-supplied `options.buildSecrets` — to
      // add more without touching the call sites. Secrets never persist in image
      // history (unlike build-args); they live in 0600 temp files removed post-build.
      const BUILD_SECRET_ENV = {
        //   // Cloudinary creds power build-time asset pulls (`node bin fs --pull`).
        //   cloudinary_cloud_name: 'CLOUDINARY_CLOUD_NAME',
        //   cloudinary_api_key: 'CLOUDINARY_API_KEY',
        //   cloudinary_api_secret: 'CLOUDINARY_API_SECRET',
      };
      for (const [id, envVar] of Object.entries(BUILD_SECRET_ENV)) addBuildSecret(id, process.env[envVar]);
      for (const [id, value] of Object.entries(options.buildSecrets || {})) addBuildSecret(id, value);
      const secretArgs = secretFlags.length ? ` ${secretFlags.join(' ')}` : '';
      if (secretFlags.length) logger.info('Passing host credentials as build secrets', { ids: secretFlags.length });

      // Non-secret build args: injected
      // dynamically from `options.buildArgs`, overriding the Dockerfile's ARG
      // defaults. Unlike secrets these DO persist in image metadata, so only
      // non-sensitive values belong here.
      const buildArgFlags = Object.entries(options.buildArgs || {})
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `--build-arg ${shellArgumentFactory(`${k}=${v}`)}`);
      const buildArgStr = buildArgFlags.length ? ` ${buildArgFlags.join(' ')}` : '';

      const dockerfile = `./${dockerfileName && typeof dockerfileName === 'string' ? dockerfileName : 'Dockerfile'}`;
      if (path)
        try {
          UnderpostImage.API.pullDockerfileBaseImages(nodePath.join(path, dockerfile));
          shellExec(
            `cd ${shellArgumentFactory(path)} && sudo podman build -f ${shellArgumentFactory(dockerfile)} -t ${shellArgumentFactory(imageName)}${target ? ` --target ${shellArgumentFactory(target)}` : ''} --pull=never --cap-add=CAP_AUDIT_WRITE${cache}${secretArgs}${buildArgStr} --network host`,
          );
        } finally {
          for (const file of secretTmpFiles) {
            try {
              fs.removeSync(file);
            } catch {
              /* best-effort cleanup */
            }
          }
        }
      // Loading into any target requires the tar archive, so imply the save when one is set
      // (kind/kubeadm/k3s/docker-compose) even if --podman-save was omitted. A CRI-O node needs
      // none: the root build above already wrote the image where CRI-O reads it.
      const crio = kubeadm === true && resolveCriSocket() === CRI_SOCKETS.crio;
      const loadTarget = kind === true || (kubeadm === true && !crio) || k3s === true || dockerCompose === true;
      if (podmanSave === true || loadTarget) {
        if (fs.existsSync(tarFile)) fs.removeSync(tarFile);
        shellExec(`podman save -o ${shellArgumentFactory(tarFile)} ${shellArgumentFactory(podManImg)}`);
      }
      if (kind === true) shellExec(`sudo kind load image-archive ${shellArgumentFactory(tarFile)}`);
      else if (kubeadm === true && !crio) kubeadmImport(tarFile);
      else if (k3s === true) shellExec(`sudo ${imageImportCommandFactory(CRI_SOCKETS.k3s, tarFile)}`);
      // Independent of any cluster target: make the local image available to the
      // Docker daemon so `docker compose` can resolve it (e.g. ENGINE_CYBERIA_IMAGE).
      if (dockerCompose === true) shellExec(`sudo docker load -i ${shellArgumentFactory(tarFile)}`);
    },
    /**
     * @method release
     * @description The image a container release deploys, by digest. The public channel pulls the
     * `latest` image CI pushed (`<repository>:latest`) into each node runtime; the private channel builds
     * the checkout at the exact revision on this host, with this engine staged as the CLI package like CI
     * does. A build serves this host's runtime as it is, and is streamed into the runtime of every other
     * node. The digest every node resolves names it.
     * @param {object} options - Also the node selection of {@link nodeRuntimesFactory}.
     * @param {string} options.imageName - The registry repository, e.g. `underpost/cyberia-server`.
     * @param {string} options.revision - The exact source revision.
     * @param {string} [options.path] - The checkout to build from, for the private channel.
     * @returns {string} `<repository>@sha256:<digest>`.
     * @memberof UnderpostImage
     */
    release({ imageName, revision, path = '', ...selection }) {
      const exact = assertSourceRevision(revision);
      const repository = `${imageName || ''}`.replace(/[:@].*$/, '');
      if (!repository) throw new Error('image --release needs --image-name <repository>');
      const runtimes = nodeRuntimesFactory(selection);
      if (!path) {
        pullImage(runtimes, `${repository}:latest`);
        return sharedDigest(runtimes, `${repository}:latest`);
      }
      const name = repositoryNameFactory(repository);
      const reference = `localhost/${name}:${exact}`;
      const shipped = runtimes.some(({ local }) => !local);
      const cliPackage = stageCliPackage(path);
      try {
        UnderpostImage.API.build({
          path,
          imageName: `${name}:${exact}`,
          ...(shipped ? {} : { kubeadm: !selection.k3s, k3s: !!selection.k3s }),
        });
      } finally {
        fs.removeSync(cliPackage);
      }
      if (shipped) loadImage(runtimes, `podman save ${shellArgumentFactory(reference)}`);
      return sharedDigest(runtimes, reference);
    },
    /**
     * @method digest
     * @description The immutable identity of an image reference: each node runtime pulls it from its
     * registry, so a tag resolves to what the registry holds now, and the digest they share names it.
     * @param {object} options - Also the node selection of {@link nodeRuntimesFactory}.
     * @param {string} options.reference - A tag or digest reference, e.g. `underpost/engine-cyberia:v3.5.0`.
     * @param {boolean} [options.pull=true] - Pull first; a locally built image is already in the runtime.
     * @returns {string} `<repository>@sha256:<digest>`.
     * @memberof UnderpostImage
     */
    digest({ reference, pull = true, ...selection }) {
      if (!repositoryNameFactory(reference)) throw new Error('image --digest needs an image reference');
      const runtimes = nodeRuntimesFactory(selection);
      if (pull) pullImage(runtimes, reference);
      return sharedDigest(runtimes, reference);
    },
    /**
     * @method importTar
     * @description Loads a pre-built image tar archive without building anything: into the node runtimes
     * of the cluster that `--kind`, `--kubeadm`, `--k3s` or `--nodes` selects, and into the local Docker
     * daemon with `--docker-compose`.
     * @param {object} options - CLI options; also the node selection of {@link nodeRuntimesFactory}.
     * @param {string} options.importTar - Path to the image tar archive (e.g. `./image-v1.0.0.tar`).
     * @param {boolean} [options.kubeadm] - Load into the kubeadm node runtime (CRI-O or containerd).
     * @param {boolean} [options.dockerCompose] - Load into the local Docker daemon (`docker load`) for Docker Compose.
     * @returns {void}
     * @memberof UnderpostImage
     */
    importTar({ importTar, kubeadm = false, dockerCompose = false, ...selection }) {
      if (!importTar || typeof importTar !== 'string' || !fs.existsSync(importTar)) {
        logger.error('image --import-tar: archive not found', { importTar });
        return;
      }
      const cluster = kubeadm || selection.kind || selection.k3s || parseList(selection.nodes).length > 0;
      if (!cluster && !dockerCompose) {
        logger.warn(
          'image --import-tar: no target; combine with --kind, --kubeadm, --k3s, --nodes or --docker-compose',
        );
        return;
      }
      const archive = shellArgumentFactory(importTar);
      const runtimes = cluster ? nodeRuntimesFactory(selection) : [];
      loadImage(runtimes, `cat ${archive}`);
      if (dockerCompose) shellExec(`sudo docker load -i ${archive}`);
      logger.info('image --import-tar: archive loaded', {
        importTar,
        nodes: runtimes.map(({ node }) => node),
        dockerCompose,
      });
    },
    /**
     * @method list
     * @description Lists the images each node runtime holds, one row per image with its `NODE`. With
     * `spec`, lists the images the pod specifications name instead.
     * @param {object} [options] - Also the node selection of {@link nodeRuntimesFactory}.
     * @param {boolean} [options.spec=false] - List the images of the pod specifications.
     * @param {string} [options.namespace=''] - The namespace of the pods `spec` reads; all when empty.
     * @param {boolean} [options.log=false] - Print the rows as a table.
     * @returns {Array<object>}
     * @memberof UnderpostImage
     */
    list({ spec = false, namespace = '', log = false, ...selection } = {}) {
      const rows = spec
        ? shellExec(
            `kubectl get pods ${namespace ? `--namespace ${shellArgumentFactory(namespace)}` : `--all-namespaces`} -o=jsonpath='{range .items[*]}{"\\n"}{.metadata.namespace}{"/"}{.metadata.name}{":\\t"}{range .spec.containers[*]}{.image}{", "}{end}{end}'`,
            { stdout: true, silent: true },
          )
            .split('\n')
            .map((line) => ({
              pod: line.split('\t')[0].replaceAll(':', '').trim(),
              image: line.split('\t')[1] ? line.split('\t')[1].replaceAll(',', '').trim() : null,
            }))
            .filter(({ image }) => image)
        : nodeRuntimesFactory(selection).flatMap((runtime) =>
            crictlTableFactory(crictl(runtime, 'images', { stdout: true, silent: true })).map((row) => ({
              NODE: runtime.node,
              ...row,
            })),
          );
      if (log) console.table(rows);
      return rows;
    },
    /**
     * @method rm
     * @description Removes an image from each node runtime.
     * @param {object} options - Also the node selection of {@link nodeRuntimesFactory}.
     * @param {string} options.imageName - The image reference or id to remove.
     * @memberof UnderpostImage
     */
    rm({ imageName, ...selection }) {
      for (const runtime of nodeRuntimesFactory(selection)) crictl(runtime, `rmi ${shellArgumentFactory(imageName)}`);
    },
    /**
     * @method pullDockerHubImage
     * @description Pulls a Docker Hub image into each node runtime that does not hold it yet.
     * @param {object} options - Also the node selection of {@link nodeRuntimesFactory}.
     * @param {string} options.dockerhubImage - The image; `underpost` names the engine image of this version.
     * @param {string} [options.version=''] - The tag when the image names none; `latest` when empty.
     * @memberof UnderpostImage
     */
    pullDockerHubImage({ dockerhubImage = '', version = '', ...selection }) {
      if (dockerhubImage.startsWith('localhost')) {
        logger.warn('[image] pullDockerHubImage skipped — local image cannot be pulled from Docker Hub', {
          dockerhubImage,
        });
        return;
      }
      if (dockerhubImage === 'underpost') {
        dockerhubImage = 'underpost/underpost-engine';
        version ||= Underpost.version;
      }
      const image = dockerhubImage.includes(':') ? dockerhubImage : `${dockerhubImage}:${version || 'latest'}`;
      for (const runtime of nodeRuntimesFactory(selection)) {
        if (inspectImage(runtime, image)) {
          logger.info('[image] pull skipped. Image already loaded', { image, node: runtime.node });
          continue;
        }
        pullImage([runtime], image);
      }
    },
  };
}
export default UnderpostImage;
