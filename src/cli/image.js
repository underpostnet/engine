import fs from 'fs-extra';
import Underpost from '../index.js';
import { shellCd, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { awaitDeployMonitor, getNpmRootPath } from '../server/conf.js';
import { timer } from '../client/components/core/CommonJs.js';
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
          secrets: false,
          secretsPath: '',
          noCache: false,
        },
      ) {
        const { path, imageName, imagePath, dockerfileName, podmanSave, secrets, secretsPath, kindLoad, noCache } =
          options;
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
            } -t ${imageName} --pull=never --cap-add=CAP_AUDIT_WRITE${cache}${secretDockerInput}`,
          );

        if (podmanSave === true) shellExec(`podman save -o ${tarFile} ${podManImg}`);
        if (kindLoad === true) shellExec(`sudo kind load image-archive ${tarFile}`);
      },
      async script(deployId = 'default', env = 'development', options = { run: false, build: false }) {
        if (options.build === true) {
          const buildBasePath = `/home/dd`;
          const repoName = `engine-${deployId.split('-')[1]}`;
          shellExec(`cd ${buildBasePath} && underpost clone underpostnet/${repoName}`);
          shellExec(`cd ${buildBasePath} && sudo mv ./${repoName} ./engine`);
          shellExec(`cd ${buildBasePath}/engine && underpost clone underpostnet/${repoName}-private`);
          shellExec(`cd ${buildBasePath}/engine && sudo mv ./${repoName}-private ./engine-private`);
          shellCd(`${buildBasePath}/engine`);
          shellExec(`underpost install`);
          if (fs.existsSync('./engine-private/itc-scripts')) {
            const itcScripts = await fs.readdir('./engine-private/itc-scripts');
            for (const itcScript of itcScripts)
              if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
          }
          switch (deployId) {
            default:
              {
                {
                  const originPath = `./src/db/mongo/MongooseDB.js`;
                  fs.writeFileSync(
                    originPath,
                    fs.readFileSync(originPath, 'utf8').replaceAll(
                      `connect: async (host, name) => {`,
                      `connect: async (host, name) => {
    host = 'mongodb://mongodb-0.mongodb-service:27017';
          `,
                    ),
                    'utf8',
                  );
                }

                {
                  const originPath = `./src/server/valkey.js`;
                  fs.writeFileSync(
                    originPath,
                    fs.readFileSync(originPath, 'utf8').replaceAll(
                      `    // port: 6379,
    // host: 'service-valkey.default.svc.cluster.local',`,
                      `     port: 6379,
    host: 'service-valkey.default.svc.cluster.local',`,
                    ),
                    'utf8',
                  );
                }
              }
              break;
          }
          shellExec(`node bin/deploy conf ${deployId} ${env}`);
          shellExec(`node bin/deploy build-full-client ${deployId}`);
        }
        if (options.run === true) {
          const runCmd = env === 'production' ? 'run prod-img' : 'run dev-img';
          if (fs.existsSync(`./engine-private/replica`)) {
            const replicas = await fs.readdir(`./engine-private/replica`);
            for (const replica of replicas) {
              if (!replica.match(deployId)) continue;
              shellExec(`node bin/deploy conf ${replica} ${env}`);
              shellExec(`npm ${runCmd} deploy deploy-id:${replica}`, { async: true });
              await awaitDeployMonitor(true);
            }
          }
          shellExec(`node bin/deploy conf ${deployId} ${env}`);
          shellExec(`npm ${runCmd} deploy deploy-id:${deployId}`, { async: true });
          await awaitDeployMonitor(true);
          await UnderpostMonitor.API.callback(deployId, env, { itc: true });
        }
      },
    },
  };
}
export default UnderpostImage;
