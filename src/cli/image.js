import fs from 'fs-extra';
import Underpost from '../index.js';
import { shellExec } from '../server/process.js';
import { MariaDB } from '../db/mariadb/MariaDB.js';

class UnderpostImage {
  static API = {
    dockerfile: {
      pullBaseImages() {
        shellExec(`sudo podman pull docker.io/library/debian:buster`);
      },
      build(deployId = 'default', env = 'development', path = '.', imageArchive = false) {
        const imgName = `${deployId}-${env}:${Underpost.version}`;
        const podManImg = `localhost/${imgName}`;
        const imagesStoragePath = `./images`;
        const tarFile = `${imagesStoragePath}/${imgName.replace(':', '_')}.tar`;
        if (imageArchive !== true) {
          shellExec(`cd ${path} && sudo podman build -f ./Dockerfile -t ${imgName} --pull=never`);
          shellExec(`cd ${path} && podman save -o ${tarFile} ${podManImg}`);
        }
        shellExec(`cd ${path} && sudo kind load image-archive ${tarFile}`);
      },
      async script(deployId = 'default', env = 'development') {
        switch (deployId) {
          case 'dd-lampp':
            {
              const lamppPublicPath = '/xampp/htdocs/online';
              if (process.argv.includes('test')) {
                const { MARIADB_HOST, MARIADB_USER, MARIADB_PASSWORD, DD_LAMPP_TEST_DB_0 } = process.env;

                await MariaDB.query({
                  host: MARIADB_HOST,
                  user: MARIADB_USER,
                  password: MARIADB_PASSWORD,
                  query: `SHOW TABLES FROM ${DD_LAMPP_TEST_DB_0}`,
                });
                process.exit(0);
              }
              shellExec(`sudo mkdir -p ${lamppPublicPath}`);

              {
                shellExec(
                  `cd ${lamppPublicPath} && git clone https://${process.env.GITHUB_TOKEN}@github.com/${process.env.DD_LAMPP_REPO_0}`,
                );

                shellExec(`cd ${lamppPublicPath} && sudo ${process.env.DD_LAMPP_SCRIPT_0}`);

                shellExec(
                  `sudo sed -i -e "s@define( 'DB_HOST', 'localhost' );@define( 'DB_HOST', '${MARIADB_HOST}' );@g" ${lamppPublicPath}/${process.env.DD_LAMPP_REPO_0_FOLDER}/wp-config.php`,
                );
              }

              {
                shellExec(
                  `cd ${lamppPublicPath} && git clone https://${process.env.GITHUB_TOKEN}@github.com/${process.env.DD_LAMPP_REPO_1}`,
                );
              }
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
