import fs from 'fs-extra';
import Underpost from '../index.js';
import { shellCd, shellExec } from '../server/process.js';
import dotenv from 'dotenv';
import { getNpmRootPath } from '../server/conf.js';
import { timer } from '../client/components/core/CommonJs.js';
import UnderpostRootEnv from './env.js';

dotenv.config();

class UnderpostImage {
  static API = {
    dockerfile: {
      pullBaseImages() {
        shellExec(`sudo podman pull docker.io/library/debian:buster`);
      },
      build(
        deployId = 'default',
        env = 'development',
        path = '.',
        options = { imageArchive: false, podmanSave: false, imageName: '', imageVersion: '' },
      ) {
        const imgName = `${
          options.imageName && typeof options.imageName === 'string' ? options.imageName : `${deployId}-${env}`
        }:${
          options.imageVersion && typeof options.imageVersions === 'string' ? options.imageVersion : Underpost.version
        }`;
        const podManImg = `localhost/${imgName}`;
        const imagesStoragePath = `/images`;
        if (!fs.existsSync(`${path}${imagesStoragePath}`))
          fs.mkdirSync(`${path}${imagesStoragePath}`, { recursive: true });
        const tarFile = `.${imagesStoragePath}/${imgName.replace(':', '_')}.tar`;

        let secrets = ' ';
        let secretDockerInput = '';

        const envObj = dotenv.parse(fs.readFileSync(`${getNpmRootPath()}/underpost/.env`, 'utf8'));

        for (const key of Object.keys(envObj)) {
          continue;
          secrets += ` && export ${key}="${envObj[key]}" `; // $(cat gitlab-token.txt)
          secretDockerInput += ` --secret id=${key},env=${key} \ `;
        }
        // --rm --no-cache
        if (options.imageArchive !== true) {
          fs.copyFile(`${getNpmRootPath()}/underpost/.env`, `${path}/.env.underpost`);
          shellExec(
            `cd ${path}${secrets}&& sudo podman build -f ./Dockerfile -t ${imgName} --pull=never --cap-add=CAP_AUDIT_WRITE${secretDockerInput}`,
          );
          fs.removeSync(`${path}/.env.underpost`);
        }
        if (options.imageArchive !== true || options.podmanSave === true)
          shellExec(`cd ${path} && podman save -o ${tarFile} ${podManImg}`);
        shellExec(`cd ${path} && sudo kind load image-archive ${tarFile}`);
      },
      async script(deployId = 'default', env = 'development', options = { run: false, build: false }) {
        if (deployId === 'deploy') {
          const _deployId = UnderpostRootEnv.API.get('deploy-id');
          const _env = UnderpostRootEnv.API.get('deploy-env');
          const _path = UnderpostRootEnv.API.get('deploy-path');
          if (_deployId) {
            deployId = _deployId;
            if (_env) env = _env;
            if (_path) path = _path;
          } else {
            await timer(30 * 1000);
            return await UnderpostImage.API.script(deployId, env, path, options);
          }
        }
        if (options.build === true) {
          const buildBasePath = `/home/dd`;
          const repoName = `engine-${deployId.split('-')[1]}`;
          fs.mkdirSync(buildBasePath, { recursive: true });
          shellExec(`cd ${buildBasePath} && underpost clone underpostnet/${repoName}`);
          shellExec(`cd ${buildBasePath} && sudo mv ./${repoName} ./engine`);
          shellExec(`cd ${buildBasePath}/engine && underpost clone underpostnet/${repoName}-private`);
          shellExec(`cd ${buildBasePath}/engine && sudo mv ./${repoName}-private ./engine-private`);
          shellCd(`${buildBasePath}/engine`);
          shellExec(`npm install`);
          const itcScripts = fs.readdir('./engine-private/itc-scripts');
          for (const itcScript of itcScripts)
            if (itcScript.match(deployId)) shellExec(`node ./engine-private/itc-scripts/${itcScript}`);
        }
        switch (deployId) {
          case 'dd-lampp':
            {
              const lamppPublicPath = '/xampp/htdocs/online';
              shellExec(`sudo mkdir -p ${lamppPublicPath}`);
            }
            break;

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
        if (options.run === true) {
          const runCmd = env === 'production' ? 'run prod-img' : 'run dev-img';
          if (fs.existsSync(`./engine-private/replica`)) {
            const replicas = await fs.readdir(`./engine-private/replica`);
            for (const replica of replicas) {
              shellExec(`node bin/deploy conf ${replica} ${env}`);
              shellExec(`npm ${runCmd} ${replica} deploy`, { async: true });
              fs.writeFileSync(`./tmp/await-deploy`, '', 'utf8');
              const monitor = async () => {
                await timer(1000);
                if (fs.existsSync(`./tmp/await-deploy`)) return await monitor();
              };
              await monitor();
            }
            shellExec(`node bin/deploy conf ${deployId} ${env}`);
          }
          shellExec(`npm ${runCmd} ${deployId} deploy`);
        }
      },
    },
  };
}
export default UnderpostImage;
