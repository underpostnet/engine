/**
 * Image management module for pull, build, creation of docker images and loading them into Kubernetes clusters
 * @module src/cli/image.js
 * @namespace UnderpostImage
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';
import { getNpmRootPath, getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';

dotenv.config();

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
     * @description Pulls base images and builds a 'rockylinux9-underpost' image,
     * then loads it into the specified Kubernetes cluster type (Kind, Kubeadm, or K3s).
     * @param {object} options - Options for pulling and loading images.
     * @param {boolean} [options.kind=false] - If true, load image into Kind cluster.
     * @param {boolean} [options.kubeadm=false] - If true, load image into Kubeadm cluster.
     * @param {boolean} [options.k3s=false] - If true, load image into K3s cluster.
     * @param {string} [options.path=''] - Path to the Dockerfile context.
     * @param {boolean} [options.dev=false] - If true, use development mode.
     * @param {string} [options.version=''] - Version tag for the image.
     * @param {string} [options.imageName=''] - Custom name for the image.
     * @memberof UnderpostImage
     */
    pullBaseImages(
      options = {
        kind: false,
        kubeadm: false,
        k3s: false,
        path: '',
        dev: false,
        version: '',
        imageName: '',
      },
    ) {
      shellExec(`sudo podman pull docker.io/library/rockylinux:9`);
      const baseCommand = options.dev ? 'node bin' : 'underpost';
      const baseCommandOption = options.dev ? ' --dev' : '';
      const IMAGE_NAME = options.imageName
        ? `options.imageName${options.version ? `:${options.version}` : ''}`
        : `rockylinux9-underpost:${options.version ? options.version : Underpost.version}`;
      let LOAD_TYPE = '';
      if (options.kind === true) LOAD_TYPE = `--kind`;
      else if (options.kubeadm === true) LOAD_TYPE = `--kubeadm`;
      else if (options.k3s === true) LOAD_TYPE = `--k3s`;
      shellExec(
        `${baseCommand} image${baseCommandOption} --build --podman-save --reset --image-path=. --path ${
          options.path ? options.path : getUnderpostRootPath()
        } --image-name=${IMAGE_NAME} ${LOAD_TYPE}`,
      );
    },
    /**
     * @method build
     * @description Builds a Docker image using Podman, optionally saves it as a tar archive,
     * and loads it into a specified Kubernetes cluster (Kind, Kubeadm, or K3s).
     * @param {object} options - Options for building and loading images.
     * @param {string} [options.path=''] - The path to the directory containing the Dockerfile.
     * @param {string} [options.imageName=''] - The name and tag for the image (e.g., 'my-app:latest').
     * @param {string} [options.version=''] - Version tag for the image.
     * @param {string} [options.imagePath=''] - Directory to save the image tar file.
     * @param {string} [options.dockerfileName=''] - Name of the Dockerfile (defaults to 'Dockerfile').
     * @param {boolean} [options.podmanSave=false] - If true, save the image as a tar archive using Podman.
     * @param {boolean} [options.kind=false] - If true, load the image archive into a Kind cluster.
     * @param {boolean} [options.kubeadm=false] - If true, load the image archive into a Kubeadm cluster (uses 'ctr').
     * @param {boolean} [options.k3s=false] - If true, load the image archive into a K3s cluster (uses 'k3s ctr').
     * @param {boolean} [options.reset=false] - If true, perform a no-cache build.
     * @param {boolean} [options.dev=false] - If true, use development mode.
     * @memberof UnderpostImage
     */
    build(
      options = {
        path: '',
        imageName: '',
        version: '',
        imagePath: '',
        dockerfileName: '',
        podmanSave: false,
        kind: false,
        kubeadm: false,
        k3s: false,
        reset: false,
        dev: false,
      },
    ) {
      let { path, imageName, version, imagePath, dockerfileName, podmanSave, kind, kubeadm, k3s, reset, dev } = options;
      if (!path) path = '.';
      if (!imageName) imageName = `rockylinux9-underpost:${Underpost.version}`;
      if (!imagePath) imagePath = '.';
      if (!version) version = 'latest';
      version = imageName && imageName.match(':') ? '' : `:${version}`;
      const podManImg = `localhost/${imageName}${version}`;
      if (imagePath && typeof imagePath === 'string' && !fs.existsSync(imagePath))
        fs.mkdirSync(imagePath, { recursive: true });
      const tarFile = `${imagePath}/${imageName.replace(':', '_')}.tar`;
      let cache = '';
      if (reset === true) cache += ' --rm --no-cache';
      if (path)
        shellExec(
          `cd ${path} && sudo podman build -f ./${
            dockerfileName && typeof dockerfileName === 'string' ? dockerfileName : 'Dockerfile'
          } -t ${imageName} --pull=never --cap-add=CAP_AUDIT_WRITE${cache} --network host`,
        );
      if (podmanSave === true) {
        if (fs.existsSync(tarFile)) fs.removeSync(tarFile);
        shellExec(`podman save -o ${tarFile} ${podManImg}`);
      }
      if (kind === true) shellExec(`sudo kind load image-archive ${tarFile}`);
      else if (kubeadm === true) shellExec(`sudo ctr -n k8s.io images import ${tarFile}`);
      else if (k3s === true) shellExec(`sudo k3s ctr images import ${tarFile}`);
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
      const list = Underpost.deploy.getCurrentLoadedImages(
        options.nodeName ? options.nodeName : 'kind-worker',
        options,
      );
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
      if (options.dockerhubImage === 'underpost') {
        options.dockerhubImage = 'underpost/underpost-engine';
        if (!options.version) options.version = Underpost.version;
      }
      if (!options.version) options.version = 'latest';
      const version = options.dockerhubImage && options.dockerhubImage.match(':') ? '' : `:${options.version}`;
      const image = `${options.dockerhubImage}${version}`;
      if (options.kind === true) {
        shellExec(`docker pull ${image}`);
        shellExec(`sudo kind load docker-image ${image}`);
      } else {
        shellExec(`sudo crictl pull ${image}`);
      }
    },
  };
}
export default UnderpostImage;
