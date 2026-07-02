/**
 * Image management module for pull, build, creation of docker images and loading them into Kubernetes clusters
 * @module src/cli/image.js
 * @namespace UnderpostImage
 */

import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import crypto from 'crypto';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';
import { getNpmRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';

const logger = loggerFactory(import.meta);

/**
 * @class UnderpostImage
 * @description Manages Docker image operations, including pulling, building, and loading images into Kubernetes clusters.
 * This class provides a set of static methods to handle image operations, including pulling base images,
 * building custom images, and loading them into specified Kubernetes clusters (Kind, Kubeadm, or K3s).
 * @memberof UnderpostImage
 */
class UnderpostImage {
  static API = {
    /**
     * @method pullBaseImages
     * @description Ensures the base image prerequisites for the runtime Dockerfiles
     * are present on the host (currently `docker.io/rockylinux/rockylinux:9`). This
     * only pulls — it does NOT build. Builds run with `podman build --pull=never`,
     * so the base must exist locally beforehand; that is the sole purpose of this
     * step. Combine with `--build` in the same command to pull-then-build.
     * @memberof UnderpostImage
     */
    pullBaseImages() {
      shellExec(`sudo podman pull docker.io/rockylinux/rockylinux:9`);
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
     * @param {boolean} [options.podmanSave=false] - If true, save the image as a tar archive using Podman.
     * @param {boolean} [options.kind=false] - If true, load the image archive into a Kind cluster.
     * @param {boolean} [options.kubeadm=false] - If true, load the image archive into a Kubeadm cluster (uses 'ctr').
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
        podmanSave: false,
        kind: false,
        kubeadm: false,
        k3s: false,
        dockerCompose: false,
        reset: false,
        dev: false,
      },
    ) {
      let { path, imageName, version, imageOutPath, dockerfileName, podmanSave, kind, kubeadm, k3s, dockerCompose, reset, dev } =
        options;
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
        secretFlags.push(`--secret id=${id},src=${file}`);
      };
      addBuildSecret('github_token', process.env.GITHUB_TOKEN);
      addBuildSecret('github_username', process.env.GITHUB_USERNAME);
      // Cloudinary creds power build-time asset pulls (`node bin fs --pull`).
      addBuildSecret('cloudinary_cloud_name', process.env.CLOUDINARY_CLOUD_NAME);
      addBuildSecret('cloudinary_api_key', process.env.CLOUDINARY_API_KEY);
      addBuildSecret('cloudinary_api_secret', process.env.CLOUDINARY_API_SECRET);
      const secretArgs = secretFlags.length ? ` ${secretFlags.join(' ')}` : '';
      if (secretFlags.length)
        logger.info('Passing host GitHub credentials as build secrets', { ids: secretFlags.length });

      if (path)
        try {
          shellExec(
            `cd ${path} && sudo podman build -f ./${
              dockerfileName && typeof dockerfileName === 'string' ? dockerfileName : 'Dockerfile'
            } -t ${imageName} --pull=never --cap-add=CAP_AUDIT_WRITE${cache}${secretArgs} --network host`,
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
      // Loading into any target requires the tar archive, so imply the save when
      // one is set (kind/kubeadm/k3s/docker-compose) even if --podman-save was omitted.
      const loadTarget = kind === true || kubeadm === true || k3s === true || dockerCompose === true;
      if (podmanSave === true || loadTarget) {
        if (fs.existsSync(tarFile)) fs.removeSync(tarFile);
        shellExec(`podman save -o ${tarFile} ${podManImg}`);
      }
      if (kind === true) shellExec(`sudo kind load image-archive ${tarFile}`);
      else if (kubeadm === true) shellExec(`sudo ctr -n k8s.io images import ${tarFile}`);
      else if (k3s === true) shellExec(`sudo k3s ctr images import ${tarFile}`);
      // Independent of any cluster target: make the local image available to the
      // Docker daemon so `docker compose` can resolve it (e.g. ENGINE_CYBERIA_IMAGE).
      if (dockerCompose === true) shellExec(`sudo docker load -i ${tarFile}`);
    },
    /**
     * @method importTar
     * @description Loads a pre-built image tar archive into each enabled target
     * without building anything. Mirrors the load step of {@link build}, but
     * the archive is supplied directly via `--import-tar <tar-path>` and every
     * enabled target flag is honored (the same archive is loaded into each), so
     * `--kind --docker-compose` loads it into both.
     * @param {object} options - CLI options.
     * @param {string} options.importTar - Path to the image tar archive (e.g. `./image-v1.0.0.tar`).
     * @param {boolean} [options.kind] - Load into the Kind cluster (`kind load image-archive`).
     * @param {boolean} [options.kubeadm] - Import into kubeadm containerd (`ctr -n k8s.io images import`).
     * @param {boolean} [options.k3s] - Import into k3s containerd (`k3s ctr images import`).
     * @param {boolean} [options.dockerCompose] - Load into the local Docker daemon (`docker load`) for Docker Compose.
     * @returns {void}
     * @memberof UnderpostImage
     */
    importTar(options = { importTar: '', kind: false, kubeadm: false, k3s: false, dockerCompose: false }) {
      const { importTar, kind, kubeadm, k3s, dockerCompose } = options;
      if (!importTar || typeof importTar !== 'string' || !fs.existsSync(importTar)) {
        logger.error('image --import-tar: archive not found', { importTar });
        return;
      }
      const targets = [];
      if (kind === true) {
        shellExec(`sudo kind load image-archive ${importTar}`);
        targets.push('kind');
      }
      if (kubeadm === true) {
        shellExec(`sudo ctr -n k8s.io images import ${importTar}`);
        targets.push('kubeadm');
      }
      if (k3s === true) {
        shellExec(`sudo k3s ctr images import ${importTar}`);
        targets.push('k3s');
      }
      if (dockerCompose === true) {
        shellExec(`sudo docker load -i ${importTar}`);
        targets.push('docker-compose');
      }
      if (targets.length === 0)
        logger.warn(
          'image --import-tar: no target enabled; combine with --kind, --kubeadm, --k3s and/or --docker-compose',
        );
      else logger.info('image --import-tar: archive loaded', { importTar, targets });
    },
    /**
     * @method getCurrentLoaded
     * @description Retrieves the currently loaded images in the Kubernetes cluster.
     * @param {string} [node='kind-worker'] - Node name to check for loaded images.
     * @param {object} options - Options for the image retrieval.
     * @param {boolean} options.spec - Whether to retrieve images from the pod specifications.
     * @param {string} options.namespace - Kubernetes namespace to filter pods.
     * @returns {Array<object>} - Array of objects containing pod names and their corresponding images.
     * @memberof UnderpostImage
     */
    getCurrentLoaded(node = 'kind-worker', options = { spec: false, namespace: '' }) {
      if (options.spec) {
        const raw = shellExec(
          `kubectl get pods ${options.namespace ? `--namespace ${options.namespace}` : `--all-namespaces`} -o=jsonpath='{range .items[*]}{"\\n"}{.metadata.namespace}{"/"}{.metadata.name}{":\\t"}{range .spec.containers[*]}{.image}{", "}{end}{end}'`,
          {
            stdout: true,
            silent: true,
          },
        );
        return raw
          .split(`\n`)
          .map((lines) => ({
            pod: lines.split('\t')[0].replaceAll(':', '').trim(),
            image: lines.split('\t')[1] ? lines.split('\t')[1].replaceAll(',', '').trim() : null,
          }))
          .filter((o) => o.image);
      }
      const raw = shellExec(node === 'kind-worker' ? `docker exec -i ${node} crictl images` : `crictl images`, {
        stdout: true,
        silent: true,
      });

      const heads = raw
        .split(`\n`)[0]
        .split(' ')
        .filter((_r) => _r.trim());

      const pods = raw
        .split(`\n`)
        .filter((r) => !r.match('IMAGE'))
        .map((r) => r.split(' ').filter((_r) => _r.trim()));

      const result = [];

      for (const row of pods) {
        if (row.length === 0) continue;
        const pod = {};
        let index = -1;
        for (const head of heads) {
          if (head in pod) continue;
          index++;
          pod[head] = row[index];
        }
        result.push(pod);
      }
      return result;
    },
    /**
     * @method list
     * @description Lists currently loaded Docker images in the specified Kubernetes cluster node.
     * @param {object} options - Options for listing loaded images.
     * @param {string} [options.nodeName='kind-worker'] - The name of the node to query.
     * @param {string} [options.namespace=''] - The namespace to filter images (if applicable).
     * @param {boolean} [options.spec=false] - If true, include detailed specifications of each image.
     * @param {boolean} [options.log=false] - If true, log the list of images to the console.
     * @param {boolean} [options.k3s=false] - If true, list images from a K3s cluster.
     * @param {boolean} [options.kubeadm=false] - If true, list images from a Kubeadm cluster.
     * @param {boolean} [options.kind=false] - If true, list images from a Kind cluster.
     * @returns {Array} - An array of loaded images information.
     * @memberof UnderpostImage
     */
    list(options = { nodeName: '', namespace: '', spec: false, log: false, k3s: false, kubeadm: false, kind: false }) {
      if ((options.kubeadm === true || options.k3s === true) && !options.nodeName)
        options.nodeName = shellExec('echo $HOSTNAME', { stdout: true, silent: true }).trim();
      const list = Underpost.image.getCurrentLoaded(options.nodeName ? options.nodeName : 'kind-worker', options);
      if (options.log) console.table(list);
      return list;
    },
    /**
     * @method rm
     * @description Removes a specified Docker image from the specified Kubernetes cluster type (Kind, Kubeadm, or K3s).
     * @param {object} options - Options for removing the image.
     * @param {string} [options.imageName=''] - The name and tag of the image to be removed.
     * @param {boolean} [options.k3s=false] - If true, remove the image from a K3s cluster.
     * @param {boolean} [options.kubeadm=false] - If true, remove the image from a Kubeadm cluster.
     * @param {boolean} [options.kind=false] - If true, remove the image from a Kind cluster.
     * @memberof UnderpostImage
     */
    rm(options = { imageName: '', k3s: false, kubeadm: false, kind: false }) {
      let { imageName, k3s, kubeadm, kind } = options;
      if (kind === true) {
        shellExec(`docker exec -i kind-control-plane crictl rmi ${imageName}`);
        shellExec(`docker exec -i kind-worker crictl rmi ${imageName}`);
      } else if (kubeadm === true) {
        shellExec(`crictl rmi ${imageName}`);
      } else if (k3s === true) {
        shellExec(`sudo k3s ctr images rm ${imageName}`);
      }
    },
    /**
     * @method pullDockerHubImage
     * @description Pulls a Docker image from Docker Hub and loads it into the specified Kubernetes cluster type (Kind, Kubeadm, or K3s).
     * @param {object} options - Options for pulling and loading the image.
     * @param {boolean} [options.k3s=false] - If true, load the image into a K3s cluster.
     * @param {boolean} [options.kubeadm=false] - If true, load the image into a Kubeadm cluster.
     * @param {boolean} [options.kind=false] - If true, load the image into a Kind cluster.
     * @param {string} [options.dockerhubImage=''] - The name of the Docker Hub image to be pulled.
     * @param {string} [options.version=''] - The version tag of the image to be pulled.
     * @memberof UnderpostImage
     */
    pullDockerHubImage(options = { k3s: false, kubeadm: false, kind: false, dockerhubImage: '', version: '' }) {
      if (options.dockerhubImage && options.dockerhubImage.startsWith('localhost')) {
        logger.warn(`[image] pullDockerHubImage skipped — local image cannot be pulled from Docker Hub`, {
          dockerhubImage: options.dockerhubImage,
        });
        return;
      }
      if (options.dockerhubImage === 'underpost') {
        options.dockerhubImage = 'underpost/underpost-engine';
        if (!options.version) options.version = Underpost.version;
      }
      if (!options.version) options.version = 'latest';
      const version = options.dockerhubImage && options.dockerhubImage.match(':') ? '' : `:${options.version}`;
      const image = `${options.dockerhubImage}${version}`;
      const targetKind = options.kind === true;
      const targetK3s = options.k3s === true;
      const targetKubeadm = options.kubeadm === true || (!targetKind && !targetK3s);

      const requestedRepo = image.replace(/:[^/]+$/, '');
      const requestedTag = image.match(/:([^/]+)$/)?.[1] || 'latest';
      const normalizeRepo = (repo = '') =>
        repo
          .trim()
          .replace(/^localhost\//, '')
          .replace(/^docker\.io\//, '')
          .replace(/^library\//, '');

      const currentImages = UnderpostImage.API.list({
        kind: targetKind,
        kubeadm: targetKubeadm,
        k3s: targetK3s,
        log: false,
      });

      const existsInCluster = currentImages.some((row) => {
        const rowImageRaw = String(row.IMAGE || row.image || '').trim();
        if (!rowImageRaw) return false;
        const rowImage = rowImageRaw.replace(/:[^/]+$/, '');
        const rowTag = String(row.TAG || rowImageRaw.match(/:([^/]+)$/)?.[1] || '').trim();
        return normalizeRepo(rowImage) === normalizeRepo(requestedRepo) && rowTag === requestedTag;
      });

      if (existsInCluster) {
        logger.info(`[image] pull skipped. Image already loaded`, {
          image,
          clusterType: targetKind ? 'kind' : targetK3s ? 'k3s' : 'kubeadm',
        });
        return;
      }
      if (targetKind) {
        shellExec(`docker pull ${image}`);
        shellExec(`sudo kind load docker-image ${image}`);
      } else {
        shellExec(`sudo crictl pull ${image}`);
      }
    },
  };
}
export default UnderpostImage;
