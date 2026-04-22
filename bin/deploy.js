import fs from 'fs-extra';
import axios from 'axios';

import dotenv from 'dotenv';

import { pbcopy, shellExec } from '../src/server/process.js';
import { loggerFactory } from '../src/server/logger.js';
import {
  addApiConf,
  addClientConf,
  buildApiSrc,
  buildClientSrc,
  cloneConf,
  addWsConf,
  buildWsSrc,
  cloneSrcComponents,
  writeEnv,
  buildCliDoc,
  loadConf,
} from '../src/server/conf.js';
import colors from 'colors';
import { program } from '../src/cli/index.js';
import { timer, getCapVariableName } from '../src/client/components/core/CommonJs.js';
import Underpost from '../src/index.js';

colors.enable();

const logger = loggerFactory(import.meta);

logger.info('argv', process.argv);

const [exe, dir, operator] = process.argv;

try {
  switch (operator) {
    case 'add-nodejs-app-client-conf':
      {
        const toOptions = {
          deployId: process.argv[3],
          clientId: process.argv[4],
          host: process.argv[5],
          path: process.argv[6],
        };
        const fromOptions = { deployId: process.argv[7], clientId: process.argv[8] };
        addClientConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-conf-app':
      {
        const toOptions = { deployId: process.argv[3], clientId: process.argv[4] };
        const fromOptions = { deployId: process.argv[5], clientId: process.argv[6] };
        cloneConf({ toOptions, fromOptions });
      }
      break;
    case 'clone-nodejs-src-client-components':
      {
        const fromOptions = { componentsFolder: process.argv[3] };
        const toOptions = { componentsFolder: process.argv[4] };
        cloneSrcComponents({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-app':
      {
        const toOptions = { deployId: process.argv[3], clientId: process.argv[4] };
        const fromOptions = { deployId: process.argv[5], clientId: process.argv[6] };
        buildClientSrc({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-conf-api':
      {
        const toOptions = { apiId: process.argv[3], deployId: process.argv[4], clientId: process.argv[5] };
        const fromOptions = { apiId: process.argv[6], deployId: process.argv[7], clientId: process.argv[8] };
        addApiConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-api':
      {
        const toOptions = { apiId: process.argv[3], deployId: process.argv[4], clientId: process.argv[5] };
        const fromOptions = { apiId: process.argv[6], deployId: process.argv[7], clientId: process.argv[8] };
        buildApiSrc({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-conf-ws':
      {
        const toOptions = {
          wsId: process.argv[3],
          deployId: process.argv[4],
          host: process.argv[5],
          paths: process.argv[6],
        };
        const fromOptions = {
          wsId: process.argv[7],
          deployId: process.argv[8],
          host: process.argv[9],
          paths: process.argv[10],
        };
        addWsConf({ toOptions, fromOptions });
      }
      break;
    case 'build-nodejs-src-ws':
      {
        const toOptions = {
          wsId: process.argv[3],
          deployId: process.argv[4],
          host: process.argv[5],
          paths: process.argv[6],
        };
        const fromOptions = {
          wsId: process.argv[7],
          deployId: process.argv[8],
          host: process.argv[9],
          paths: process.argv[10],
        };
        buildWsSrc({ toOptions, fromOptions });
      }
      break;

    case 'new-nodejs-app':
      {
        const deployId = process.argv[3];
        const clientId = process.argv[4];

        shellExec(`node bin/deploy build-nodejs-conf-app ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-nodejs-src-app ${deployId} ${clientId}`);

        await Underpost.repo.client(deployId);

        shellExec(`npm run dev ${deployId}`);
      }
      break;
    case 'test-new-api':
      {
        const port = process.argv[3];
        const apiId = process.argv[4];
        let url = `http://localhost:${port}/api/${apiId}`;
        {
          logger.info(`POST REQUEST`, url);
          const result = await axios.post(url, {});
          url += '/' + result.data.data._id;
          logger.info(`POST RESULT ${url}`, result.data);
        }
        {
          logger.info(`GET REQUEST`, url);
          const result = await axios.get(url);
          logger.info(`GET RESULT ${url}`, result.data);
        }
        {
          logger.info(`DELETE REQUEST`, url);
          const result = await axios.delete(url);
          logger.info(`DELETE RESULT ${url}`, result.data);
        }
      }
      break;
    case 'new-nodejs-api':
      {
        const apiId = process.argv[3];
        const deployId = process.argv[4];
        const clientId = process.argv[5];

        shellExec(`node bin/deploy build-nodejs-conf-api ${apiId} ${deployId} ${clientId}`);

        shellExec(`node bin/deploy build-nodejs-src-api ${apiId} ${deployId} ${clientId}`);
      }
      break;
    case 'new-nodejs-ws':
      {
        const wsId = process.argv[3];
        const deployId = process.argv[4];
        const host = process.argv[5];
        const paths = process.argv[6];

        shellExec(`node bin/deploy build-nodejs-conf-ws ${wsId} ${deployId} ${host} ${paths}`);

        shellExec(`node bin/deploy build-nodejs-src-ws ${wsId} ${deployId} ${host} ${paths}`);

        shellExec(`npm run dev ${deployId}`);
      }
      break;

    case 'update-dependencies':
      const files = await fs.readdir(`./engine-private/conf`, { recursive: true });
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      for (const relativePath of files) {
        const filePah = `./engine-private/conf/${relativePath.replaceAll(`\\`, '/')}`;
        if (filePah.split('/').pop() === 'package.json') {
          const deployPackage = JSON.parse(fs.readFileSync(filePah, 'utf8'));
          deployPackage.dependencies = originPackage.dependencies;
          deployPackage.devDependencies = originPackage.devDependencies;
          deployPackage.overrides = originPackage.overrides;
          fs.writeFileSync(filePah, JSON.stringify(deployPackage, null, 4), 'utf8');
        }
      }
      break;

    case 'rename-package': {
      const name = process.argv[3];
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      originPackage.name = name;
      fs.writeFileSync(`./package.json`, JSON.stringify(originPackage, null, 4), 'utf8');

      const originPackageLockJson = JSON.parse(fs.readFileSync(`./package-lock.json`, 'utf8'));
      originPackageLockJson.name = name;
      originPackageLockJson.packages[''].name = name;
      fs.writeFileSync(`./package-lock.json`, JSON.stringify(originPackageLockJson, null, 4), 'utf8');

      break;
    }

    case 'set-repo': {
      const originPackage = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      originPackage.repository = {
        type: 'git',
        url: `git+https://github.com/${process.argv[3]}.git`,
      };
      fs.writeFileSync(`./package.json`, JSON.stringify(originPackage, null, 4), 'utf8');

      break;
    }

    case 'build-default-confs': {
      for (const deployId of fs
        .readFileSync(`./engine-private/deploy/dd.router`, 'utf8')
        .split(`,`)
        .concat(['dd-cron'])) {
        if (fs.existsSync(`./engine-private/conf/${deployId}/build/development/deployment.yaml`))
          fs.copySync(
            `./engine-private/conf/${deployId}/build/development/deployment.yaml`,
            `./manifests/deployment/${deployId}-development/deployment.yaml`,
          );
        if (fs.existsSync(`./engine-private/conf/${deployId}/build/development/proxy.yaml`))
          fs.copySync(
            `./engine-private/conf/${deployId}/build/development/proxy.yaml`,
            `./manifests/deployment/${deployId}-development/proxy.yaml`,
          );
        if (fs.existsSync(`./engine-private/conf/${deployId}/build/development/pv-pvc.yaml`))
          fs.copySync(
            `./engine-private/conf/${deployId}/build/development/pv-pvc.yaml`,
            `./manifests/deployment/${deployId}-development/pv-pvc.yaml`,
          );
        shellExec(`node bin new --dev --default-conf --deploy-id ${deployId}`);
      }
      break;
    }

    case 'update-authors': {
      // #### Ordered by first contribution.
      fs.writeFileSync(
        './AUTHORS.md',
        `# Authors


${shellExec(`git log | grep Author: | sort -u`, { stdout: true }).split(`\n`).join(`\n\n\n`)}

#### Generated by [underpost.net](https://underpost.net)`,
        'utf8',
      );

      break;
    }

    case 'maas-db': {
      // DROP, ALTER, CREATE, WITH ENCRYPTED
      // sudo -u <user> -h <host> psql <db-name>
      shellExec(`DB_PG_MAAS_NAME=${process.env.DB_PG_MAAS_NAME}`);
      shellExec(`DB_PG_MAAS_PASS=${process.env.DB_PG_MAAS_PASS}`);
      shellExec(`DB_PG_MAAS_USER=${process.env.DB_PG_MAAS_USER}`);
      shellExec(`DB_PG_MAAS_HOST=${process.env.DB_PG_MAAS_HOST}`);
      shellExec(
        `sudo -i -u postgres psql -c "CREATE USER \"$DB_PG_MAAS_USER\" WITH ENCRYPTED PASSWORD '$DB_PG_MAAS_PASS'"`,
      );
      shellExec(
        `sudo -i -u postgres psql -c "ALTER USER \"$DB_PG_MAAS_USER\" WITH ENCRYPTED PASSWORD '$DB_PG_MAAS_PASS'"`,
      );
      const actions = ['LOGIN', 'SUPERUSER', 'INHERIT', 'CREATEDB', 'CREATEROLE', 'REPLICATION'];
      shellExec(`sudo -i -u postgres psql -c "ALTER USER \"$DB_PG_MAAS_USER\" WITH ${actions.join(' ')}"`);
      shellExec(`sudo -i -u postgres psql -c "\\du"`);

      shellExec(`sudo -i -u postgres createdb -O "$DB_PG_MAAS_USER" "$DB_PG_MAAS_NAME"`);

      shellExec(`sudo -i -u postgres psql -c "\\l"`);
      break;
    }

    case 'cli-docs': {
      buildCliDoc(program, process.argv[3], process.argv[4]);
      break;
    }

    case 'postgresql-17': {
      if (process.argv.includes('install')) {
        shellExec(`sudo dnf module reset postgresql -y`);
        shellExec(`sudo dnf -qy module disable postgresql`);
        shellExec(
          `sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm`,
        );
        shellExec(`sudo dnf -qy module disable postgresql`);
        shellExec(`sudo dnf install -y postgresql17 postgresql17-server postgresql17-contrib`);

        shellExec(`sudo /usr/pgsql-17/bin/postgresql-17-setup initdb`);
      }
      if (process.argv.includes('uninstall')) {
        shellExec(`sudo systemctl stop postgresql-17`);
        shellExec(`sudo systemctl disable postgresql-17`);

        // Remove PostgreSQL 17 packages and repo
        shellExec(`sudo dnf remove -y postgresql17 postgresql17-server postgresql17-contrib`);
        shellExec(`sudo rpm -e pgdg-redhat-repo-$(rpm -q pgdg-redhat-repo --qf '%{VERSION}-%{RELEASE}')`);
        shellExec(`sudo rm -f /etc/yum.repos.d/pgdg-redhat-*.repo`);

        // Clean up data, logs, config, and the postgres user
        shellExec(`sudo rm -rf /var/lib/pgsql/17 /var/log/pgsql`);
        shellExec(`sudo rm -rf /etc/postgresql`);
      } else {
        shellExec(`sudo systemctl enable postgresql-17`);
        shellExec(`sudo systemctl start postgresql-17`);
      }
      break;
    }

    case 'pg-list-db': {
      shellExec(`sudo -i -u postgres psql -c "\\l"`);
      break;
    }

    case 'pg-list-table': {
      shellExec(`sudo -i -u postgres psql -c "\\dt *.*"`);
      // schema_name.*
      break;
    }
    case 'pg-drop-db': {
      shellExec(`sudo -i -u postgres psql -c "DROP DATABASE ${process.argv[3]} WITH (FORCE)"`);
      shellExec(`sudo -i -u postgres psql -c "DROP USER ${process.argv[4]}"`);
      break;
    }

    case 'maas-stop': {
      shellExec(`sudo snap stop maas`);
      break;
    }

    case 'fastapi-models': {
      shellExec(`chmod +x ../full-stack-fastapi-template/backend/initial_data.sh`);
      shellExec(`../full-stack-fastapi-template/backend/initial_data.sh`);
      shellExec(`../full-stack-fastapi-template/backend/initial_data.sh`);
      break;
    }

    case 'fastapi': {
      // node bin/deploy fastapi reset
      // node bin/deploy fastapi reset build-back build-front secret run-back run-front
      // https://github.com/NonsoEchendu/full-stack-fastapi-project
      // https://github.com/fastapi/full-stack-fastapi-template
      const path = `../full-stack-fastapi-template`;
      const VITE_API_URL = `http://localhost:8000`;

      if (process.argv.includes('reset')) shellExec(`sudo rm -rf ${path}`);

      if (!fs.existsSync(path))
        shellExec(`cd .. && git clone https://github.com/fastapi/full-stack-fastapi-template.git`);

      shellExec(`cd ${path} && git checkout . && git clean -f -d`);
      const password = fs.readFileSync(`/home/dd/engine/engine-private/postgresql-password`, 'utf8');

      fs.writeFileSync(
        `${path}/.env`,
        fs
          .readFileSync(`${path}/.env`, 'utf8')
          .replace(
            `FIRST_SUPERUSER=admin@example.com`,
            `FIRST_SUPERUSER=${process.env.GITHUB_EMAIL || 'development@underpost.net'}`,
          )
          .replace(`FIRST_SUPERUSER_PASSWORD=changethis`, `FIRST_SUPERUSER_PASSWORD=${password}`)
          .replace(`SECRET_KEY=changethis`, `SECRET_KEY=${password}`)
          .replace(`POSTGRES_DB=app`, `POSTGRES_DB=postgresdb`)
          .replace(`POSTGRES_USER=postgres`, `POSTGRES_USER=admin`)
          .replace(`POSTGRES_PASSWORD=changethis`, `POSTGRES_PASSWORD=${password}`),
        'utf8',
      );
      fs.writeFileSync(
        `${path}/backend/app/core/db.py`,
        fs
          .readFileSync(`${path}/backend/app/core/db.py`, 'utf8')
          .replace(`    # from sqlmodel import SQLModel`, `    from sqlmodel import SQLModel`)
          .replace(`   # SQLModel.metadata.create_all(engine)`, `   SQLModel.metadata.create_all(engine)`),

        'utf8',
      );

      fs.copySync(`./manifests/deployment/fastapi/initial_data.sh`, `${path}/backend/initial_data.sh`);

      fs.writeFileSync(
        `${path}/frontend/Dockerfile`,
        fs
          .readFileSync(`${path}/frontend/Dockerfile`, 'utf8')
          .replace('ARG VITE_API_URL=${VITE_API_URL}', `ARG VITE_API_URL='${VITE_API_URL}'`),
        'utf8',
      );

      fs.writeFileSync(
        `${path}/frontend/.env`,
        fs
          .readFileSync(`${path}/frontend/.env`, 'utf8')
          .replace(`VITE_API_URL=http://localhost:8000`, `VITE_API_URL=${VITE_API_URL}`)
          .replace(`MAILCATCHER_HOST=http://localhost:1080`, `MAILCATCHER_HOST=http://localhost:1081`),

        'utf8',
      );

      if (process.argv.includes('models')) {
        shellExec(`node bin/deploy fastapi-models`);
        break;
      }

      if (process.argv.includes('build-back')) {
        const imageName = `fastapi-backend:latest`;
        shellExec(`sudo podman pull docker.io/library/python:3.10`);
        shellExec(`sudo podman pull ghcr.io/astral-sh/uv:0.5.11`);
        shellExec(`sudo rm -rf ${path}/${imageName.replace(':', '_')}.tar`);
        const args = [
          `node bin image --build --path ${path}/backend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'} --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('build-front')) {
        const imageName = `fastapi-frontend:latest`;
        shellExec(`sudo podman pull docker.io/library/node:20`);
        shellExec(`sudo podman pull docker.io/library/nginx:1`);
        shellExec(`sudo rm -rf ${path}/${imageName.replace(':', '_')}.tar`);
        const args = [
          `node bin image --build --path ${path}/frontend/`,
          `--image-name=${imageName} --image-path=${path}`,
          `--podman-save --${process.argv.includes('kubeadm') ? 'kubeadm' : 'kind'} --reset`,
        ];
        shellExec(args.join(' '));
      }
      if (process.argv.includes('secret')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        {
          const secretSelector = `fastapi-postgres-credentials`;
          shellExec(`sudo kubectl delete secret ${secretSelector} -n ${namespace} --ignore-not-found`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-literal=POSTGRES_DB=postgresdb` +
              ` --from-literal=POSTGRES_USER=admin` +
              ` --from-file=POSTGRES_PASSWORD=/home/dd/engine/engine-private/postgresql-password` +
              ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
          );
        }
        {
          const secretSelector = `fastapi-backend-config-secret`;
          shellExec(`sudo kubectl delete secret ${secretSelector} -n ${namespace} --ignore-not-found`);
          shellExec(
            `sudo kubectl create secret generic ${secretSelector}` +
              ` --from-file=SECRET_KEY=/home/dd/engine/engine-private/postgresql-password` +
              ` --from-literal=FIRST_SUPERUSER=${process.env.GITHUB_EMAIL || 'development@underpost.net'}` +
              ` --from-file=FIRST_SUPERUSER_PASSWORD=/home/dd/engine/engine-private/postgresql-password` +
              ` --dry-run=client -o yaml | kubectl apply -f - -n ${namespace}`,
          );
        }
      }
      if (process.argv.includes('run-back')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-deployment.yml -n ${namespace}`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/backend-service.yml -n ${namespace}`);
      }
      if (process.argv.includes('run-front')) {
        const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-deployment.yml -n ${namespace}`);
        shellExec(`sudo kubectl apply -f ./manifests/deployment/fastapi/frontend-service.yml -n ${namespace}`);
      }
      break;
    }

    case 'conda': {
      // set -e
      // ENV_NAME="${1:-cuda_env}"
      // eval "$(conda shell.bash hook)"
      // conda activate "${ENV_NAME}"
      shellExec(
        `export PATH="/root/miniconda3/bin:$PATH" && conda init && conda config --set auto_activate_base false`,
      );
      shellExec(`conda env list`);
      break;
    }

    case 'kafka': {
      // https://medium.com/@martin.hodges/deploying-kafka-on-a-kind-kubernetes-cluster-for-development-and-testing-purposes-ed7adefe03cb
      const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'kafka';
      const imageName = `doughgle/kafka-kraft`;
      shellExec(`docker pull ${imageName}`);
      if (!process.argv.includes('kubeadm'))
        shellExec(
          `${process.argv.includes('kubeadm') ? `ctr -n k8s.io images import` : `kind load docker-image`} ${imageName}`,
        );
      shellExec(`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
      shellExec(`kubectl apply -f ./manifests/deployment/kafka/deployment.yaml -n ${namespace}`);
      // kubectl logs kafka-0 -n kafka | grep STARTED
      // kubectl logs kafka-1 -n kafka | grep STARTED
      // kubectl logs kafka-2 -n kafka | grep STARTED

      // kafka-topics.sh --create --topic my-topic --bootstrap-server kafka-svc:9092
      // kafka-topics.sh --list --topic my-topic --bootstrap-server kafka-svc:9092
      // kafka-topics.sh --delete --topic my-topic --bootstrap-server kafka-svc:9092

      // kafka-console-producer.sh --bootstrap-server kafka-svc:9092 --topic my-topic
      // kafka-console-consumer.sh --bootstrap-server kafka-svc:9092 --topic my-topic
      break;
    }

    case 'nvidia-gpu-operator': {
      // https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
      shellExec(`curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo`);

      const NVIDIA_CONTAINER_TOOLKIT_VERSION = '1.17.8-1';

      shellExec(`sudo dnf install -y \
nvidia-container-toolkit-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
nvidia-container-toolkit-base-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
libnvidia-container-tools-${NVIDIA_CONTAINER_TOOLKIT_VERSION} \
libnvidia-container1-${NVIDIA_CONTAINER_TOOLKIT_VERSION}`);

      // https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html
      const namespace = 'gpu-operator';
      shellExec(`kubectl create ns ${namespace} --dry-run=client -o yaml | kubectl apply -f -`);
      shellExec(`kubectl label --overwrite ns ${namespace} pod-security.kubernetes.io/enforce=privileged`);

      shellExec(`helm repo add nvidia https://helm.ngc.nvidia.com/nvidia \
    && helm repo update`);

      //       shellExec(`helm install --wait --generate-name \
      // -n gpu-operator --create-namespace \
      // nvidia/gpu-operator \
      // --version=v25.3.1 \
      // --set toolkit.version=v1.16.1-ubi8`);

      shellExec(`helm install --wait --generate-name \
-n gpu-operator --create-namespace \
nvidia/gpu-operator \
--version=v25.3.1 \
--set driver.enabled=false \
--set driver.repository=nvcr.io/nvidia \
--set cdi.enabled=true \
--set cdi.default=true \
--set toolkit.env[0].name=CONTAINERD_CONFIG \
--set toolkit.env[0].value=/etc/containerd/config.toml \
--set toolkit.env[1].name=CONTAINERD_SOCKET \
--set toolkit.env[1].value=/run/containerd/containerd.sock \
--set toolkit.env[2].name=CONTAINERD_RUNTIME_CLASS \
--set toolkit.env[2].value=nvidia \
--set-string toolkit.env[3].name=CONTAINERD_SET_AS_DEFAULT \
--set-string toolkit.env[3].value=true`);

      // Check gpu drivers
      shellExec(
        `break;kubectl get nodes -o json | jq '.items[].metadata.labels | keys | any(startswith("feature.node.kubernetes.io"))'`,
      );
      break;
    }

    case 'kubeflow-spark-operator': {
      // Use case:
      // Data Processing Pipelines: Used for ETL tasks where Spark can handle large data volumes efficiently.
      // Real-Time Analytics: Processing data from streaming sources (e.g., Kafka) for real-time analytics.
      // Machine Learning and Data Science: Training and deploying machine learning models at scale using Spark MLlib.

      shellExec(`helm repo add spark-operator https://kubeflow.github.io/spark-operator`);
      shellExec(`helm install spark-operator spark-operator/spark-operator \
  --namespace spark-operator \
  --create-namespace \
  --wait`);

      const image = `spark:3.5.5`;
      shellExec(`sudo docker pull ${image}`);
      if (!process.argv.includes('kubeadm'))
        shellExec(
          `sudo ${
            process.argv.includes('kubeadm') ? `ctr -n k8s.io images import` : `kind load docker-image`
          } ${image}`,
        );
      const namespace = process.argv.find((arg) => arg.startsWith('--namespace='))?.split('=')[1] || 'default';
      shellExec(`kubectl apply -f ./manifests/deployment/spark/spark-pi-py.yaml -n ${namespace}`);

      // Check the status of the Spark job:
      // kubectl get sparkapplications.sparkoperator.k8s.io -n default
      // kubectl get sparkapplication

      // Check case log:
      // kubectl logs -f spark-pi-python-driver
      // kubectl logs -f spark-pi-python-driver | grep Pi
      // kubectl describe sparkapplication spark-gpu-test

      // Uninstall:
      // kubectl delete sparkapplications.sparkoperator.k8s.io spark-pi-python -n default
      // helm delete spark-operator -n spark-operator

      // Gpu plugins:
      // https://github.com/NVIDIA/spark-rapids
      // RAPIDS Accelerator
      break;
    }

    case 'tls': {
      fs.mkdirSync(`./engine-private/ssl/localhost`, { recursive: true });
      const targetDir = `./engine-private/ssl/${process.argv[3] ? process.argv[3] : 'localhost'}`;
      const domains = ['localhost', '127.0.0.1', '::1'].concat(process.argv[3] ? process.argv[3] : []);
      shellExec(`chmod +x ./scripts/ssl.sh`);
      shellExec(`./scripts/ssl.sh ${targetDir} "${domains.join(' ')}"`);
      break;
    }

    case 'build-envs': {
      const buildEnv = (privateEnvPath, originEnv, env) => {
        const privateEnv = dotenv.parse(fs.readFileSync(privateEnvPath, 'utf8'));
        for (const key of Object.keys(privateEnv)) {
          if (key in env) {
            console.warn(`Key ${key} already exists in origin env`);
            continue;
          }
          if (key in originEnv) {
            console.warn(`Key ${key} already exists in origin env`);
            env[key] = originEnv[key];
            continue;
          }
          env[key] =
            `${key}`.toUpperCase().match('API') ||
            `${key}`.toUpperCase().match('KEY') ||
            `${key}`.toUpperCase().match('SECRET') ||
            `${key}`.toUpperCase().match('TOKEN') ||
            `${key}`.toUpperCase().match('PASSWORD') ||
            `${key}`.toUpperCase().match('MAC')
              ? 'changethis'
              : isNaN(parseFloat(privateEnv[key]))
                ? `${privateEnv[key]}`.match(`@`)
                  ? 'admin@default.net'
                  : 'changethis'
                : privateEnv[key];
        }
        return env;
      };
      for (let envPath of ['.env.development', '.env.production', '.env.test']) {
        const originEnv = dotenv.parse(fs.readFileSync(`./${envPath}`, 'utf8'));

        let env = {};
        env = buildEnv(`./engine-private/conf/dd-cron/${envPath}`, originEnv, env);
        env = buildEnv(`./engine-private/conf/dd-core/${envPath}`, originEnv, env);
        writeEnv(envPath, env);
      }
      break;
    }

    case 'sync-start': {
      const targetDeployId = process.argv[3] || 'dd';
      const deployIds =
        targetDeployId === 'dd'
          ? fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(',')
          : [targetDeployId];
      const originPackageJson = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      for (const deployId of deployIds) {
        const packageJsonPath = `./engine-private/conf/${deployId}/package.json`;
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageJson.scripts = { start: `${originPackageJson.scripts.start} ${deployId}` };
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4), 'utf8');
        logger.info(`sync-start`, { deployId, start: packageJson.scripts.start });
      }
      break;
    }

    case 'sync-envs': {
      for (const deployId of ['dd-cron'].concat(
        fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','),
      )) {
        for (const env of ['production', 'development', 'test']) {
          const _envObj = dotenv.parse(fs.readFileSync(`./engine-private/conf/${deployId}/.env.${env}`, 'utf8'));
          for (const env of []) {
            delete _envObj[env];
          }
          writeEnv(`./engine-private/conf/${deployId}/.env.${env}`, _envObj);
        }
      }
      break;
    }

    case 'sync-conf': {
      const originPackageJson = JSON.parse(fs.readFileSync(`./package.json`, 'utf8'));
      for (const deployId of ['dd-cron'].concat(
        fs.readFileSync(`./engine-private/deploy/dd.router`, 'utf8').split(','),
      )) {
        for (const file of fs.readdirSync(`./engine-private/conf/${deployId}/`)) {
          const deployPackage = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/package.json`, 'utf8'));
          deployPackage.overrides = originPackageJson.overrides;
          deployPackage.dependencies = originPackageJson.dependencies;
          fs.writeFileSync(
            `./engine-private/conf/${deployId}/package.json`,
            JSON.stringify(deployPackage, null, 4),
            'utf8',
          );
          if (file.startsWith('conf.server') && file.endsWith('.json')) {
            const filePath = `./engine-private/conf/${deployId}/${file}`;
            const confObj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            for (const host of Object.keys(confObj)) {
              for (const path of Object.keys(confObj[host])) {
              }
            }
            // fs.writeFileSync(filePath, JSON.stringify(confObj, null, 4), 'utf8');
            logger.info(`sync-conf`, { deployId, file });
          }
        }
      }
      break;
    }

    case 'cyberia': {
      const { CyberiaDependencies } = await import(`../src/client/components/cyberia-portal/CommonCyberiaPortal.js`);
      for (const dep of Object.keys(CyberiaDependencies)) {
        const ver = CyberiaDependencies[dep];
        shellExec(`npm install ${dep}@${ver}`);
      }
      break;
    }

    case 'pw': {
      const help = `node bin/deploy pw <script-path> <from-path-in-pod> [to-path-on-local]`;
      const scriptPath = process.argv[3];
      const fromPath = process.argv[4];
      const toPath = process.argv[5] ? process.argv[5] : fromPath ? `/tmp/${fromPath.split('/').pop()}` : '';
      if (scriptPath === 'help') {
        logger.info(help);
        break;
      }
      if (fs.existsSync(toPath)) fs.removeSync(toPath);
      shellExec(`node bin/deploy pw-conf ${scriptPath}`);
      shellExec(`kubectl delete deployment playwright-server --ignore-not-found`);
      while (Underpost.kubectl.get('playwright-server').length > 0) {
        logger.info(`Waiting for playwright-server deployment to be deleted...`);
        await timer(1000);
      }
      shellExec(`kubectl apply -f manifests/deployment/playwright/deployment.yaml`);
      const id = 'playwright-server';
      await Underpost.test.statusMonitor(id);
      const nameSpace = 'default';
      const [pod] = Underpost.kubectl.get(id);
      const podName = pod.NAME;
      shellExec(`kubectl logs -f ${podName} -n ${nameSpace}`, {
        async: true,
      });
      (async () => {
        while (!Underpost.kubectl.existsFile({ podName, path: fromPath })) {
          await timer(1000);
          logger.info(`Waiting for file ${fromPath} in pod ${podName}...`);
        }
        shellExec(`sudo kubectl cp ${nameSpace}/${podName}:${fromPath} ${toPath}`);
        if (toPath.match('.png') && fs.existsSync(toPath)) shellExec(`firefox ${toPath}`);
      })();
      break;
    }

    case 'pw-conf': {
      const scriptPath = process.argv[3];
      shellExec(`kubectl delete configmap playwright-script`);
      shellExec(`kubectl create configmap playwright-script \
  --from-file=script.js=${scriptPath} \
  --dry-run=client -o yaml | kubectl apply -f -
`);
      break;
    }

    case 'dependabot': {
      dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
      shellExec(`git fetch origin --prune`);

      const { stdout: branchOutput } = shellExec(`git branch -r`, { silent: true });
      const dependabotBranches = branchOutput
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b.startsWith('remotes/origin/dependabot/') || b.startsWith('origin/dependabot/'))
        .map((b) => b.replace(/^remotes\//, '').replace(/^origin\//, ''));

      if (dependabotBranches.length === 0) {
        logger.info('No remote dependabot branches found');
        break;
      }

      logger.info('Found dependabot branches:', dependabotBranches);

      // Stash local changes to prevent checkout/merge conflicts
      const stashResult = shellExec(`git stash --include-untracked`, { silent: true });
      const hasStash = !stashResult.stdout.includes('No local changes to save');

      // Checkout master
      const checkoutResult = shellExec(`git checkout master`);
      if (checkoutResult.code !== 0) {
        logger.error('Failed to checkout master');
        if (hasStash) shellExec(`git stash pop`);
        break;
      }

      // Pull latest master
      shellExec(`git pull origin master`);

      // Get repo URI from remote
      const remoteUrl = shellExec(`git config --get remote.origin.url`, { stdout: true, silent: true }).trim();
      const gitUri = remoteUrl.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '');

      const mergedBranches = [];
      const failedBranches = [];

      for (const branch of dependabotBranches) {
        logger.info(`Merging branch: ${branch}`);
        const mergeResult = shellExec(`git merge origin/${branch}`);
        if (mergeResult.code === 0) {
          const isAlreadyMerged = mergeResult.stdout && mergeResult.stdout.includes('Already up to date');
          mergedBranches.push({ branch, isAlreadyMerged });
        } else {
          logger.error(`Failed to merge branch: ${branch}`);
          shellExec(`git merge --abort`, { silent: true });
          failedBranches.push(branch);
        }
      }

      // Delete merged local and remote branches
      for (const { branch, isAlreadyMerged } of mergedBranches) {
        shellExec(`git branch -D ${branch}`, { silent: true });
        // logger.info(`Deleting remote branch: ${branch}${isAlreadyMerged ? ' (already merged)' : ''}`);
        // shellExec(`git push https://${process.env.GITHUB_TOKEN}@github.com/${gitUri}.git --delete ${branch}`, {
        //   disableLog: true,
        // });
      }

      // Restore stashed changes
      if (hasStash) shellExec(`git stash pop`);

      logger.info(
        'Merged branches:',
        mergedBranches.map((m) => m.branch),
      );
      if (failedBranches.length > 0) logger.warn('Failed branches:', failedBranches);
      logger.info('Dependabot merge completed');
      break;
    }

    case 'add-server-client': {
      // node bin/deploy add-server-client <clientId> <deployId> <host> <path>
      // Example: node bin/deploy add-server-client cecinasmarcelina dd-core cecinasmarcelina.com /
      // Example: node bin/deploy add-server-client cecinasmarcelina dd-core www.cecinasmarcelina.com /
      const clientId = process.argv[3];
      const deployId = process.argv[4];
      const rawHost = process.argv[5];
      const path = process.argv[6];

      // Normalize: strip www. prefix to get the base host
      const baseHost = rawHost.startsWith('www.') ? rawHost.slice(4) : rawHost;
      const mainHost = `www.${baseHost}`;
      const redirectHost = baseHost;

      loadConf('clean');
      loadConf();
      shellExec(`node bin/deploy clone-client default ${clientId} dd-default ${deployId}`);
      // default.net has the main client entry → maps to www.<host> (main)
      shellExec(`node bin/deploy clone-server default.net / ${mainHost} ${path} dd-default ${deployId} ${clientId}`);
      // www.default.net has the redirect/empty entry → maps to <host> (redirect)
      shellExec(`node bin/deploy clone-server www.default.net / ${redirectHost} ${path} dd-default ${deployId}`);
      fs.removeSync(`./engine-private/conf/dd-default`);
      break;
    }

    case 'clone-client': {
      // node bin/deploy clone-client <fromClientId> <toClientId> <fromDeployId> [toDeployId]
      // Example: node bin/deploy clone-client dogmadual mynewclient dd-core
      // Example: node bin/deploy clone-client dogmadual mynewclient dd-core dd-other
      //
      // Clones a client configuration and its src/ files with a new name.
      // If toDeployId is omitted, it defaults to fromDeployId (same deploy).
      // Steps:
      // - conf.client.json: clones the fromClientId entry as toClientId (renames identifiers)
      // - conf.ssr.json: clones the SSR entry under the new PascalCase name
      // - conf.server.json + dev variants: duplicates paths referencing fromClientId for toClientId
      // - src/client/components/<fromClientId>/ → src/client/components/<toClientId>/ (renames identifiers)
      // - src/client/services/<fromClientId>/ → src/client/services/<toClientId>/ (renames identifiers)
      // - src/client/ssr/head/<From>Scripts.js → <To>Scripts.js
      // - src/client/ssr/body/<From>*.js → <To>*.js (SplashScreen, etc.)
      // - src/client/ssr/mailer/<From>*.js → <To>*.js (VerifyEmail, RecoverEmail, etc.)
      // - src/client/<From>.index.js → <To>.index.js
      // - src/client/public/<fromClientId>/ → src/client/public/<toClientId>/

      const fromClientId = process.argv[3];
      const toClientId = process.argv[4];
      const fromDeployId = process.argv[5];
      const toDeployId = process.argv[6] || fromDeployId;

      if (!fromClientId || !toClientId || !fromDeployId) {
        logger.error('Usage: node bin/deploy clone-client <fromClientId> <toClientId> <fromDeployId> [toDeployId]');
        logger.error('Example: node bin/deploy clone-client dogmadual mynewclient dd-core');
        process.exit(1);
      }

      const fromCapName = getCapVariableName(fromClientId);
      const toCapName = getCapVariableName(toClientId);

      const confFromFolder = `./engine-private/conf/${fromDeployId}`;
      const confToFolder = `./engine-private/conf/${toDeployId}`;

      if (!fs.existsSync(confFromFolder)) {
        logger.error(`Source config folder not found: ${confFromFolder}`);
        process.exit(1);
      }
      if (!fs.existsSync(confToFolder)) {
        logger.error(`Target config folder not found: ${confToFolder}`);
        process.exit(1);
      }

      const formattedSrc = (src) => src.replaceAll(fromCapName, toCapName).replaceAll(fromClientId, toClientId);

      // 1. Clone conf.client.json entry
      {
        const clientConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
        if (clientConf[toClientId]) {
          logger.warn(`conf.client.json: "${toClientId}" already exists, skipping`);
        } else {
          const fromClientConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.client.json`, 'utf8'));
          if (!fromClientConf[fromClientId]) {
            logger.error(`conf.client.json: "${fromClientId}" not found in ${confFromFolder}`);
            process.exit(1);
          }
          clientConf[toClientId] = JSON.parse(formattedSrc(JSON.stringify(fromClientConf[fromClientId])));
          fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(clientConf, null, 4), 'utf8');
          logger.info(`conf.client.json: cloned "${fromClientId}" → "${toClientId}"`);
        }
      }

      // 2. Clone conf.ssr.json entry
      {
        const ssrConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.ssr.json`, 'utf8'));
        if (ssrConf[toCapName]) {
          logger.warn(`conf.ssr.json: "${toCapName}" already exists, skipping`);
        } else {
          const fromSsrConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.ssr.json`, 'utf8'));
          if (fromSsrConf[fromCapName]) {
            ssrConf[toCapName] = JSON.parse(formattedSrc(JSON.stringify(fromSsrConf[fromCapName])));
            fs.writeFileSync(`${confToFolder}/conf.ssr.json`, JSON.stringify(ssrConf, null, 4), 'utf8');
            logger.info(`conf.ssr.json: cloned "${fromCapName}" → "${toCapName}"`);
          } else {
            logger.warn(`conf.ssr.json: "${fromCapName}" not found in ${confFromFolder}, skipping`);
          }
        }
      }

      // 3. Clone server conf entries (conf.server.json + dev variants)
      const cloneServerConfEntries = (filePath, label) => {
        if (!fs.existsSync(filePath)) return;
        const serverConf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let count = 0;
        for (const host of Object.keys(serverConf)) {
          for (const path of Object.keys(serverConf[host])) {
            const entry = serverConf[host][path];
            if (entry.client === fromClientId) {
              const newPath = path === '/' ? `/${toClientId}` : path.replace(fromClientId, toClientId);
              if (!serverConf[host][newPath]) {
                serverConf[host][newPath] = JSON.parse(formattedSrc(JSON.stringify(entry)));
                count++;
              }
            }
          }
        }
        if (count > 0) {
          fs.writeFileSync(filePath, JSON.stringify(serverConf, null, 4), 'utf8');
        }
        logger.info(`${label}: cloned ${count} server path(s) for "${toClientId}"`);
      };

      cloneServerConfEntries(`${confToFolder}/conf.server.json`, 'conf.server.json');
      const devFiles = fs
        .readdirSync(confToFolder)
        .filter((f) => f.startsWith('conf.server.dev.') && f.endsWith('.json'));
      for (const devFile of devFiles) {
        cloneServerConfEntries(`${confToFolder}/${devFile}`, devFile);
      }

      // 4. Clone src/client/components/<fromClientId>/ → <toClientId>/
      const srcFromFolder = `./src/client/components/${fromClientId}`;
      const srcToFolder = `./src/client/components/${toClientId}`;

      if (!fs.existsSync(srcFromFolder)) {
        logger.warn(`Source component folder not found: ${srcFromFolder}, skipping src clone`);
      } else if (fs.existsSync(srcToFolder)) {
        logger.warn(`Target component folder already exists: ${srcToFolder}, skipping src clone`);
      } else {
        fs.mkdirSync(srcToFolder, { recursive: true });
        const files = fs.readdirSync(srcFromFolder, { recursive: true });
        for (const relativePath of files) {
          const fromFilePath = `${srcFromFolder}/${relativePath}`;
          if (fs.statSync(fromFilePath).isDirectory()) {
            fs.mkdirSync(`${srcToFolder}/${formattedSrc(relativePath)}`, { recursive: true });
            continue;
          }
          const toFileName = formattedSrc(relativePath);
          fs.writeFileSync(`${srcToFolder}/${toFileName}`, formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
        }
        logger.info(`src/client/components: cloned ${srcFromFolder} → ${srcToFolder} (${files.length} files)`);
      }

      // 5. Clone src/client/services/<fromClientId>/ → <toClientId>/
      {
        const svcFromFolder = `./src/client/services/${fromClientId}`;
        const svcToFolder = `./src/client/services/${toClientId}`;
        if (!fs.existsSync(svcFromFolder)) {
          logger.warn(`Source services folder not found: ${svcFromFolder}, skipping`);
        } else if (fs.existsSync(svcToFolder)) {
          logger.warn(`Target services folder already exists: ${svcToFolder}, skipping`);
        } else {
          fs.mkdirSync(svcToFolder, { recursive: true });
          const svcFiles = fs.readdirSync(svcFromFolder, { recursive: true });
          for (const relativePath of svcFiles) {
            const fromFilePath = `${svcFromFolder}/${relativePath}`;
            if (fs.statSync(fromFilePath).isDirectory()) {
              fs.mkdirSync(`${svcToFolder}/${formattedSrc(relativePath)}`, { recursive: true });
              continue;
            }
            const toFileName = formattedSrc(relativePath);
            fs.writeFileSync(
              `${svcToFolder}/${toFileName}`,
              formattedSrc(fs.readFileSync(fromFilePath, 'utf8')),
              'utf8',
            );
          }
          logger.info(`src/client/services: cloned ${svcFromFolder} → ${svcToFolder} (${svcFiles.length} files)`);
        }
      }

      // 6. Clone SSR head scripts
      const fromScriptsPath = `./src/client/ssr/head/${fromCapName}Scripts.js`;
      const toScriptsPath = `./src/client/ssr/head/${toCapName}Scripts.js`;
      if (fs.existsSync(fromScriptsPath) && !fs.existsSync(toScriptsPath)) {
        fs.writeFileSync(toScriptsPath, formattedSrc(fs.readFileSync(fromScriptsPath, 'utf8')), 'utf8');
        logger.info(`ssr/head: cloned ${fromCapName}Scripts.js → ${toCapName}Scripts.js`);
      } else if (fs.existsSync(toScriptsPath)) {
        logger.warn(`ssr/head: ${toCapName}Scripts.js already exists, skipping`);
      }

      // 7. Clone SSR body files
      {
        const ssrConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.ssr.json`, 'utf8'));
        const toSsr = ssrConf[toCapName];
        if (toSsr && Array.isArray(toSsr.body)) {
          for (const bodyName of toSsr.body) {
            if (!bodyName.startsWith(toCapName)) continue;
            const fromBodyName = bodyName.replace(toCapName, fromCapName);
            const fromBodyPath = `./src/client/ssr/body/${fromBodyName}.js`;
            const toBodyPath = `./src/client/ssr/body/${bodyName}.js`;
            if (fs.existsSync(fromBodyPath) && !fs.existsSync(toBodyPath)) {
              fs.writeFileSync(toBodyPath, formattedSrc(fs.readFileSync(fromBodyPath, 'utf8')), 'utf8');
              logger.info(`ssr/body: cloned ${fromBodyName}.js → ${bodyName}.js`);
            } else if (fs.existsSync(toBodyPath)) {
              logger.warn(`ssr/body: ${bodyName}.js already exists, skipping`);
            }
          }
        }
      }

      // 8. Clone SSR mailer files
      {
        const ssrConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.ssr.json`, 'utf8'));
        const toSsr = ssrConf[toCapName];
        if (toSsr && toSsr.mailer && typeof toSsr.mailer === 'object') {
          for (const mailerName of Object.values(toSsr.mailer)) {
            if (!mailerName.startsWith(toCapName)) continue;
            const fromMailerName = mailerName.replace(toCapName, fromCapName);
            const fromMailerPath = `./src/client/ssr/mailer/${fromMailerName}.js`;
            const toMailerPath = `./src/client/ssr/mailer/${mailerName}.js`;
            if (fs.existsSync(fromMailerPath) && !fs.existsSync(toMailerPath)) {
              fs.writeFileSync(toMailerPath, formattedSrc(fs.readFileSync(fromMailerPath, 'utf8')), 'utf8');
              logger.info(`ssr/mailer: cloned ${fromMailerName}.js → ${mailerName}.js`);
            } else if (fs.existsSync(toMailerPath)) {
              logger.warn(`ssr/mailer: ${mailerName}.js already exists, skipping`);
            }
          }
        }
      }

      // 9. Clone client index
      const fromIndexPath = `./src/client/${fromCapName}.index.js`;
      const toIndexPath = `./src/client/${toCapName}.index.js`;
      if (fs.existsSync(fromIndexPath) && !fs.existsSync(toIndexPath)) {
        fs.writeFileSync(toIndexPath, formattedSrc(fs.readFileSync(fromIndexPath, 'utf8')), 'utf8');
        logger.info(`client: cloned ${fromCapName}.index.js → ${toCapName}.index.js`);
      } else if (fs.existsSync(toIndexPath)) {
        logger.warn(`client: ${toCapName}.index.js already exists, skipping`);
      }

      // 10. Clone public assets
      const fromPublicPath = `./src/client/public/${fromClientId}`;
      const toPublicPath = `./src/client/public/${toClientId}`;
      if (fs.existsSync(fromPublicPath) && !fs.existsSync(toPublicPath)) {
        fs.copySync(fromPublicPath, toPublicPath);
        logger.info(`public: cloned ${fromPublicPath} → ${toPublicPath}`);
      } else if (fs.existsSync(toPublicPath)) {
        logger.warn(`public: ${toPublicPath} already exists, skipping`);
      }

      // 11. Rebuild default conf
      shellExec(`node bin new --default-conf --deploy-id ${toDeployId}`);
      logger.info(`Rebuilt default conf for ${toDeployId}`);

      break;
    }

    case 'clone-server': {
      // node bin/deploy clone-server <fromHost> <fromPath> <toHost> <toPath> <fromDeployId> <toDeployId>
      // Example: node bin/deploy clone-server www.dogmadual.com / www.newsite.com / dd-core dd-other
      // Example: node bin/deploy clone-server www.nexodev.org / www.newdomain.org /app dd-core dd-core
      //
      // Clones a specific server host/path entry from one deploy's conf to another,
      // optionally renaming the host and path in the target.
      // - conf.server.json: copies the fromHost/fromPath entry to toHost/toPath
      // - conf.server.dev.*.json: same treatment for all dev variants

      const fromHost = process.argv[3];
      const fromPath = process.argv[4];
      const toHost = process.argv[5];
      const toPath = process.argv[6];
      const fromDeployId = process.argv[7];
      const toDeployId = process.argv[8];
      const overrideClientId = process.argv[9];

      if (!fromHost || !fromPath || !toHost || !toPath || !fromDeployId || !toDeployId) {
        logger.error(
          'Usage: node bin/deploy clone-server <fromHost> <fromPath> <toHost> <toPath> <fromDeployId> <toDeployId> [clientId]',
        );
        logger.error(
          'Example: node bin/deploy clone-server www.dogmadual.com / www.newsite.com / dd-core dd-other newsite',
        );
        process.exit(1);
      }

      const confFromFolder = `./engine-private/conf/${fromDeployId}`;
      const confToFolder = `./engine-private/conf/${toDeployId}`;

      if (!fs.existsSync(confFromFolder)) {
        logger.error(`Source config folder not found: ${confFromFolder}`);
        process.exit(1);
      }
      if (!fs.existsSync(confToFolder)) {
        logger.error(`Target config folder not found: ${confToFolder}`);
        process.exit(1);
      }

      const cloneServerEntry = (fromFilePath, toFilePath, label) => {
        if (!fs.existsSync(fromFilePath)) {
          logger.warn(`${label}: source file not found, skipping`);
          return;
        }
        const fromServerConf = JSON.parse(fs.readFileSync(fromFilePath, 'utf8'));
        if (!fromServerConf[fromHost] || !fromServerConf[fromHost][fromPath]) {
          logger.warn(`${label}: "${fromHost}" "${fromPath}" not found in source, skipping`);
          return;
        }

        const toServerConf = fs.existsSync(toFilePath) ? JSON.parse(fs.readFileSync(toFilePath, 'utf8')) : {};

        if (!toServerConf[toHost]) toServerConf[toHost] = {};

        if (toServerConf[toHost][toPath]) {
          logger.warn(`${label}: "${toHost}" "${toPath}" already exists in target, skipping`);
          return;
        }

        toServerConf[toHost][toPath] = JSON.parse(JSON.stringify(fromServerConf[fromHost][fromPath]));
        // Override client field if --client= is provided
        const entry = toServerConf[toHost][toPath];
        if (overrideClientId && entry.client) {
          entry.client = overrideClientId;
        }
        // Update db.name to use the client-specific env variable
        if (entry.client && entry.db && entry.db.name) {
          const upperClientId = entry.client.replaceAll('-', '_').toUpperCase();
          entry.db.name = `env:DB_NAME_${upperClientId}`;
        }
        fs.writeFileSync(toFilePath, JSON.stringify(toServerConf, null, 4), 'utf8');
        logger.info(
          `${label}: cloned "${fromHost}" "${fromPath}" → "${toHost}" "${toPath}" (${fromDeployId} → ${toDeployId})`,
        );
      };

      // 1. Main conf.server.json
      cloneServerEntry(`${confFromFolder}/conf.server.json`, `${confToFolder}/conf.server.json`, 'conf.server.json');

      // 2. Dev variants (clone from source dev files)
      const devFiles = fs
        .readdirSync(confFromFolder)
        .filter((f) => f.startsWith('conf.server.dev.') && f.endsWith('.json'));
      for (const devFile of devFiles) {
        cloneServerEntry(`${confFromFolder}/${devFile}`, `${confToFolder}/${devFile}`, devFile);
      }

      // 3. Create individual dev file for the new entry (conf.server.dev.<clientId>.json)
      {
        const mainToPath = `${confToFolder}/conf.server.json`;
        if (fs.existsSync(mainToPath)) {
          const toServerConf = JSON.parse(fs.readFileSync(mainToPath, 'utf8'));
          const entry = toServerConf[toHost] && toServerConf[toHost][toPath];
          if (entry && entry.client) {
            const devFileName = `conf.server.dev.${entry.client}.json`;
            const devFilePath = `${confToFolder}/${devFileName}`;
            if (!fs.existsSync(devFilePath)) {
              const devConf = { [toHost]: { [toPath]: entry } };
              fs.writeFileSync(devFilePath, JSON.stringify(devConf, null, 4), 'utf8');
              logger.info(`${devFileName}: created dev file for "${toHost}" "${toPath}"`);
            } else {
              logger.info(`${devFileName}: already exists, skipping creation`);
            }
          }
        }
      }

      // 4. Add DB_NAME_<UPPER> env variable to target deploy .env.* files
      {
        const mainFromPath = `${confFromFolder}/conf.server.json`;
        if (fs.existsSync(mainFromPath)) {
          const fromServerConf = JSON.parse(fs.readFileSync(mainFromPath, 'utf8'));
          const sourceEntry = fromServerConf[fromHost] && fromServerConf[fromHost][fromPath];
          if (sourceEntry && sourceEntry.client) {
            const clientId = overrideClientId || sourceEntry.client;
            const upperClientId = clientId.replaceAll('-', '_').toUpperCase();
            const envKey = `DB_NAME_${upperClientId}`;
            const envValue = `${envKey}=${clientId}`;
            for (const envFile of ['.env.production', '.env.development', '.env.test']) {
              const envPath = `${confToFolder}/${envFile}`;
              if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                if (!envContent.includes(envKey)) {
                  fs.writeFileSync(envPath, envContent.trimEnd() + '\n' + envValue + '\n', 'utf8');
                  logger.info(`${envFile}: added ${envValue}`);
                } else {
                  logger.info(`${envFile}: ${envKey} already exists, skipping`);
                }
              }
            }
          }
        }
      }

      // 5. Rebuild default conf
      shellExec(`node bin new --default-conf --deploy-id ${toDeployId}`);
      logger.info(`Rebuilt default conf for ${toDeployId}`);

      break;
    }

    case 'add-api': {
      // node bin/deploy add-api <apiId> <deployId> [clientId] [host]
      // Example: node bin/deploy add-api cyberia-dialogue dd-cyberia cyberia-portal
      // Example: node bin/deploy add-api cyberia-dialogue dd-cyberia cyberia-portal underpost.net
      //
      // Adds an API to server conf files (main + dev variants) and client conf.
      // - conf.server.json: adds apiId to every host/path that has an `apis` array
      //   (or only to the specified host if [host] is provided)
      // - conf.server.dev.*.json: same treatment for all dev variants
      // - conf.client.json: adds apiId to the specified clientId's `services` array
      // Idempotent: skips if the API is already present.

      const apiId = process.argv[3];
      const deployId = process.argv[4];
      const clientId = process.argv[5];
      const targetHost = process.argv[6];

      if (!apiId || !deployId) {
        logger.error('Usage: node bin/deploy add-api <apiId> <deployId> [clientId] [host]');
        logger.error('Example: node bin/deploy add-api cyberia-dialogue dd-cyberia cyberia-portal');
        logger.error('Example: node bin/deploy add-api cyberia-dialogue dd-cyberia cyberia-portal underpost.net');
        process.exit(1);
      }

      const confFolder = `./engine-private/conf/${deployId}`;
      if (!fs.existsSync(confFolder)) {
        logger.error(`Config folder not found: ${confFolder}`);
        process.exit(1);
      }

      // Helper: add apiId to apis[] arrays in a server conf file (idempotent)
      // When targetHost is set, only entries under that host are modified.
      const addApiToServerConf = (filePath) => {
        if (!fs.existsSync(filePath)) return 0;
        const conf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let count = 0;
        const hosts = targetHost ? (conf[targetHost] ? [targetHost] : []) : Object.keys(conf);
        for (const host of hosts) {
          for (const path of Object.keys(conf[host])) {
            const entry = conf[host][path];
            if (Array.isArray(entry.apis) && entry.apis.length > 0 && !entry.apis.includes(apiId)) {
              entry.apis.push(apiId);
              count++;
            }
          }
        }
        if (count > 0) {
          fs.writeFileSync(filePath, JSON.stringify(conf, null, 4), 'utf8');
        }
        return count;
      };

      // 1. Main conf.server.json
      const mainPath = `${confFolder}/conf.server.json`;
      const mainCount = addApiToServerConf(mainPath);
      logger.info(`conf.server.json: added "${apiId}" to ${mainCount} path(s)`);

      // 2. All dev variants: conf.server.dev.*.json
      const devFiles = fs
        .readdirSync(confFolder)
        .filter((f) => f.startsWith('conf.server.dev.') && f.endsWith('.json'));
      for (const devFile of devFiles) {
        const devPath = `${confFolder}/${devFile}`;
        const devCount = addApiToServerConf(devPath);
        logger.info(`${devFile}: added "${apiId}" to ${devCount} path(s)`);
      }

      // Helper: add apiId to a client conf file's clientId services (idempotent)
      const addApiToClientConf = (filePath, label) => {
        if (!clientId || !fs.existsSync(filePath)) return;
        const confClient = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (confClient[clientId] && Array.isArray(confClient[clientId].services)) {
          if (!confClient[clientId].services.includes(apiId)) {
            confClient[clientId].services.push(apiId);
            fs.writeFileSync(filePath, JSON.stringify(confClient, null, 4), 'utf8');
            logger.info(`${label}: added "${apiId}" to "${clientId}" services`);
          } else {
            logger.info(`${label}: "${apiId}" already in "${clientId}" services`);
          }
        } else {
          logger.warn(`${label}: clientId "${clientId}" not found or has no services array`);
        }
      };

      // 3. Client conf.client.json
      addApiToClientConf(`${confFolder}/conf.client.json`, 'conf.client.json');

      // 4. Replicas: engine-private/replica/<deployId>-*
      const replicaBase = './engine-private/replica';
      if (fs.existsSync(replicaBase)) {
        const replicaDirs = fs
          .readdirSync(replicaBase)
          .filter((d) => d.startsWith(`${deployId}-`) && fs.statSync(`${replicaBase}/${d}`).isDirectory());
        for (const replicaDir of replicaDirs) {
          const replicaFolder = `${replicaBase}/${replicaDir}`;
          // Server conf
          const rMainCount = addApiToServerConf(`${replicaFolder}/conf.server.json`);
          logger.info(`replica/${replicaDir}/conf.server.json: added "${apiId}" to ${rMainCount} path(s)`);
          // Dev variants
          const rDevFiles = fs
            .readdirSync(replicaFolder)
            .filter((f) => f.startsWith('conf.server.dev.') && f.endsWith('.json'));
          for (const rDevFile of rDevFiles) {
            const rDevCount = addApiToServerConf(`${replicaFolder}/${rDevFile}`);
            logger.info(`replica/${replicaDir}/${rDevFile}: added "${apiId}" to ${rDevCount} path(s)`);
          }
          // Client conf
          addApiToClientConf(`${replicaFolder}/conf.client.json`, `replica/${replicaDir}/conf.client.json`);
        }
      }

      // 5. Rebuild default conf
      shellExec(`node bin new --default-conf --deploy-id ${deployId}`);
      logger.info(`Rebuilt default conf for ${deployId}`);

      break;
    }

    case 'add-component': {
      // node bin/deploy add-component <componentId> <deployId> <clientId> <submoduleId>
      // Example: node bin/deploy add-component ColorPaletteElement dd-cyberia cyberia-portal core
      //
      // Adds a component to a client conf.main and related replicas.
      // - validates src/client/components/<submoduleId>/<componentId>.js exists
      // - conf.client.json: adds componentId to the specified clientId's components[submoduleId] array
      // - replica conf.client.json: same treatment for all replicas of deployId
      // Idempotent: skips if the component is already present.

      const componentId = process.argv[3];
      const deployId = process.argv[4];
      const clientId = process.argv[5];
      const submoduleId = process.argv[6];

      if (!componentId || !deployId || !clientId || !submoduleId) {
        logger.error('Usage: node bin/deploy add-component <componentId> <deployId> <clientId> <submoduleId>');
        logger.error('Example: node bin/deploy add-component ColorPaletteElement dd-cyberia cyberia-portal core');
        process.exit(1);
      }

      const confFolder = `./engine-private/conf/${deployId}`;
      if (!fs.existsSync(confFolder)) {
        logger.error(`Config folder not found: ${confFolder}`);
        process.exit(1);
      }

      const componentPath = `./src/client/components/${submoduleId}/${componentId}.js`;
      if (!fs.existsSync(componentPath)) {
        logger.error(`Component file not found: ${componentPath}`);
        process.exit(1);
      }

      const addComponentToClientConf = (filePath, label) => {
        if (!fs.existsSync(filePath)) return;

        const confClient = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const clientConf = confClient[clientId];

        if (!clientConf) {
          logger.warn(`${label}: clientId "${clientId}" not found`);
          return;
        }

        if (!clientConf.components || !Array.isArray(clientConf.components[submoduleId])) {
          logger.warn(`${label}: clientId "${clientId}" has no components.${submoduleId} array`);
          return;
        }

        if (clientConf.components[submoduleId].includes(componentId)) {
          logger.info(`${label}: "${componentId}" already in "${clientId}" components.${submoduleId}`);
          return;
        }

        clientConf.components[submoduleId].push(componentId);
        fs.writeFileSync(filePath, JSON.stringify(confClient, null, 4), 'utf8');
        logger.info(`${label}: added "${componentId}" to "${clientId}" components.${submoduleId}`);
      };

      addComponentToClientConf(`${confFolder}/conf.client.json`, 'conf.client.json');

      const replicaBase = './engine-private/replica';
      if (fs.existsSync(replicaBase)) {
        const replicaDirs = fs
          .readdirSync(replicaBase)
          .filter((d) => d.startsWith(`${deployId}-`) && fs.statSync(`${replicaBase}/${d}`).isDirectory());

        for (const replicaDir of replicaDirs) {
          addComponentToClientConf(
            `${replicaBase}/${replicaDir}/conf.client.json`,
            `replica/${replicaDir}/conf.client.json`,
          );
        }
      }

      shellExec(`node bin new --default-conf --deploy-id ${deployId}`);
      logger.info(`Rebuilt default conf for ${deployId}`);

      break;
    }
  }
} catch (error) {
  logger.error(error, error.stack);
}
