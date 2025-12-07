/**
 * Image management module for pull, build, creation of docker images and loading them into Kubernetes clusters
 * @module src/cli/image.js
 * @namespace UnderpostImage
 */

import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';
import { getUnderpostRootPath } from '../server/conf.js';
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
     * @param {string} [options.path=false] - Path to the Dockerfile context.
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
        path: false,
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
     * @param {boolean} [options.secrets=false] - If true, load secrets from the .env file for the build.
     * @param {string} [options.secretsPath=''] - Custom path to the .env file for secrets.
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
        secrets: false,
        secretsPath: '',
        reset: false,
        dev: false,
      },
    ) {
      let {
        path,
        imageName,
        version,
        imagePath,
        dockerfileName,
        podmanSave,
        secrets,
        secretsPath,
        kind,
        kubeadm,
        k3s,
        reset,
        dev,
      } = options;
      if (!path) path = '.';
      const podManImg = `localhost/${imageName}${version ? `:${version}` : ''}`;
      if (imagePath && typeof imagePath === 'string' && !fs.existsSync(imagePath))
        fs.mkdirSync(imagePath, { recursive: true });
      const tarFile = `${imagePath}/${imageName.replace(':', '_')}.tar`;
      let secretsInput = ' ';
      let secretDockerInput = '';
      let cache = '';
      if (secrets === true) {
        const envObj = dotenv.parse(
          fs.readFileSync(
            secretsPath && typeof secretsPath === 'string' ? secretsPath : `${getNpmRootPath()}/underpost/.env`,
            'utf8',
          ),
        );
        for (const key of Object.keys(envObj)) {
          secretsInput += ` && export ${key}="${envObj[key]}" `; // Example: $(cat gitlab-token.txt)
          secretDockerInput += ` --secret id=${key},env=${key} \ `;
        }
      }
      if (reset === true) cache += ' --rm --no-cache';
      if (path && typeof path === 'string')
        shellExec(
          `cd ${path}${secretsInput}&& sudo podman build -f ./${
            dockerfileName && typeof dockerfileName === 'string' ? dockerfileName : 'Dockerfile'
          } -t ${imageName} --pull=never --cap-add=CAP_AUDIT_WRITE${cache}${secretDockerInput} --network host`,
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
     * @returns {Array} - An array of loaded images information.
     * @memberof UnderpostImage
     */
    list(options = { nodeName: '', namespace: '', spec: false, log: false }) {
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
  };
}
export default UnderpostImage;
