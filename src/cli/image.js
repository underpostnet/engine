import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../server/logger.js';
import Underpost from '../index.js';
import { getUnderpostRootPath } from '../server/conf.js';
import { shellExec } from '../server/process.js';

dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostImage {
  static API = {
    dockerfile: {
      pullBaseImages(
        options = {
          kindLoad: false,
          kubeadmLoad: false,
          path: false,
          version: '',
        },
      ) {
        shellExec(`sudo podman pull docker.io/library/debian:buster`);
        const IMAGE_NAME = `debian-underpost`;
        const IMAGE_NAME_FULL = `${IMAGE_NAME}:${options.version ?? Underpost.version}`;
        const LOAD_TYPE = options.kindLoad === true ? `--kind-load` : `--kubeadm-load`;
        shellExec(
          `underpost dockerfile-image-build --podman-save --reset --image-path=. --path ${
            options.path ?? getUnderpostRootPath()
          } --image-name=${IMAGE_NAME_FULL} ${LOAD_TYPE}`,
        );
      },
      build(
        options = {
          path: '',
          imageName: '',
          imagePath: '',
          dockerfileName: '',
          podmanSave: false,
          kindLoad: false,
          kubeadmLoad: false,
          secrets: false,
          secretsPath: '',
          reset: false,
        },
      ) {
        const {
          path,
          imageName,
          imagePath,
          dockerfileName,
          podmanSave,
          secrets,
          secretsPath,
          kindLoad,
          reset,
          kubeadmLoad,
        } = options;
        const podManImg = `localhost/${imageName}`;
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
            secretsInput += ` && export ${key}="${envObj[key]}" `; // $(cat gitlab-token.txt)
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

        if (podmanSave === true) shellExec(`podman save -o ${tarFile} ${podManImg}`);
        if (kindLoad === true) shellExec(`sudo kind load image-archive ${tarFile}`);
        if (kubeadmLoad === true) shellExec(`sudo ctr -n k8s.io images import ${tarFile}`);
      },
    },
  };
}
export default UnderpostImage;
