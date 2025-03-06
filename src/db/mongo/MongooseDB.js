import mongoose from 'mongoose';
import { loggerFactory } from '../../server/logger.js';
import { getCapVariableName } from '../../client/components/core/CommonJs.js';
import { shellCd, shellExec } from '../../server/process.js';

const logger = loggerFactory(import.meta);

const MongooseDB = {
  connect: async (host, name) => {
    const uri = `${host}/${name}`;
    // logger.info('MongooseDB connect', { host, name, uri });
    return await mongoose
      .createConnection(uri, {
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
      })
      .asPromise();
    return new Promise((resolve, reject) =>
      mongoose
        .connect(
          uri,
          // ,{
          //   useNewUrlParser: true,
          //   useUnifiedTopology: true,
          // }
        )
        .then((db) => {
          logger.info(`db connected`, uri);
          return resolve(db);
        })
        .catch((err) => {
          logger.error(err, { host, name, error: err.stack });
          // return reject(err);
          return resolve(undefined);
        }),
    );
  },
  loadModels: async function (options = { apis: ['test'], conn: new mongoose.Connection() }) {
    const { conn, apis } = options;
    const models = {};
    for (const api of apis) {
      const { ProviderSchema } = await import(`../../api/${api}/${api}.model.js`);
      const keyModel = getCapVariableName(api);
      models[keyModel] = conn.model(keyModel, ProviderSchema);
    }

    return models;
  },
  server: async function () {
    logger.info('platform', process.platform);
    switch (process.platform) {
      case 'win32':
        {
          // https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-on-windows-unattended/

          // C:\Program Files\MongoDB\Tools\100\bin

          const urlDownload = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.14-signed.msi`;
          const folderPath = `./engine-private/setup`;
          if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
          const fullPath = `${folderPath}/${urlDownload.split('/').pop()}`;
          logger.info('destination', fullPath);
          shellCd(folderPath);
        }
        break;
      case 'linux':
        {
          if (!process.argv.includes('server')) {
            logger.info('remove');
            shellExec(`sudo apt-get purge mongodb-org*`);
            shellExec(`sudo rm -r /var/log/mongodb`);
            shellExec(`sudo rm -r /var/lib/mongodb`);
            // restore lib
            // shellExec(`sudo chown -R mongodb:mongodb /var/lib/mongodb/*`);
            // mongod --repair

            if (process.argv.includes('legacy')) {
              // TODO:
              if (process.argv.includes('rocky')) {
                // https://github.com/mongodb/mongodb-selinux
                // https://www.mongodb.com/docs/v7.0/tutorial/install-mongodb-enterprise-on-red-hat/
                // https://www.mongodb.com/docs/v6.0/tutorial/install-mongodb-on-red-hat/
                // https://www.mongodb.com/docs/v4.4/tutorial/install-mongodb-on-red-hat/
                // dnf install selinux-policy-devel
                // git clone https://github.com/mongodb/mongodb-selinux
                // cd mongodb-selinux
                // make
                // sudo make install
                // yum list installed | grep mongo
                // sudo yum erase $(rpm -qa | grep mongodb)
                // remove service
                // sudo systemctl reset-failed
                // MongoDB 5.0+ requires a CPU with AVX support
                // check: grep avx /proc/cpuinfo
              }
              logger.info('install legacy 4.4');
              shellExec(`wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -`);

              shellExec(
                `echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list`,
              );

              shellExec(`sudo apt-get update`);

              shellExec(
                `sudo apt-get install mongodb-org=4.4.8 mongodb-org-server=4.4.8 mongodb-org-shell=4.4.8 mongodb-org-mongos=4.4.8 mongodb-org-tools=4.4.8`,
              );
            } else {
              logger.info('install 7.0');
              shellExec(`curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg \
   --dearmor`);
              shellExec(
                `echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list`,
              );

              shellExec(`sudo apt-get update`);

              shellExec(`sudo apt-get install -y mongodb-org`);
            }
          }
          logger.info('clean server environment');
          shellExec(`sudo service mongod stop`);
          shellExec(`sudo systemctl unmask mongod`);
          shellExec(`sudo pkill -f mongod`);
          shellExec(`sudo systemctl enable mongod.service`);

          shellExec(`sudo chown -R mongodb:mongodb /var/lib/mongodb`);
          shellExec(`sudo chown mongodb:mongodb /tmp/mongodb-27017.sock`);

          shellExec(`sudo chown -R mongod:mongod /var/lib/mongodb`);
          shellExec(`sudo chown mongod:mongod /tmp/mongodb-27017.sock`);

          logger.info('run server');
          shellExec(`sudo service mongod restart`);

          const checkStatus = () => {
            logger.info('check status');
            shellExec(`sudo systemctl status mongod`);
            shellExec(`sudo systemctl --type=service | grep mongod`);
          };

          checkStatus();
        }
        break;
      default:
        break;
    }
  },
};

export { MongooseDB };
