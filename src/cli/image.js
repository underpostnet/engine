import fs from 'fs-extra';
import Underpost from '../index.js';
import { shellExec } from '../server/process.js';

class UnderpostImage {
  static API = {
    dockerfile: {
      pullBaseImages() {
        shellExec(`sudo podman pull docker.io/library/debian:buster`);
      },
      build(deployId = 'default', env = 'development', path = '.') {
        const imgName = `${deployId}-${env}:${Underpost.version}`;
        const podManImg = `localhost/${imgName}`;
        const imagesStoragePath = `./images`;
        const tarFile = `${imagesStoragePath}/${imgName.replace(':', '_')}.tar`;
        if (!fs.existsSync(imagesStoragePath)) fs.mkdirSync(imagesStoragePath, { recursive: true });
        shellExec(`cd ${path}` + ` && sudo podman build -f ./Dockerfile -t ${imgName} --pull=never`);
        shellExec(`podman save -o ${tarFile} ${podManImg}`);
        shellExec(`sudo kind load image-archive ${tarFile}`);
      },
      script(deployId = 'default', env = 'development') {
        switch (deployId) {
          case 'dd-lampp':
            {
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
      },
    },
  };
}
export default UnderpostImage;
