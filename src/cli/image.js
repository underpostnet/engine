import fs from 'fs-extra';
import { shellCd, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { awaitDeployMonitor, getNpmRootPath } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import UnderpostMonitor from './monitor.js';

dotenv.config();

const logger = loggerFactory(import.meta);

class UnderpostImage {
  static API = {
    dockerfile: {
      pullBaseImages() {
        shellExec(`sudo podman pull docker.io/library/debian:buster`);
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
          noCache: false,
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
          noCache,
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
        if (noCache === true) cache += ' --rm --no-cache';
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
