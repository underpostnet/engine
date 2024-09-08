import fs from 'fs-extra';
import dotenv from 'dotenv';
import { cap, newInstance, range, timer } from '../client/components/core/CommonJs.js';
import * as dir from 'path';
import cliProgress from 'cli-progress';
import cliSpinners from 'cli-spinners';
import logUpdate from 'log-update';
import colors from 'colors';
import { loggerFactory } from './logger.js';

colors.enable();
dotenv.config();

const logger = loggerFactory(import.meta);

// monitoring: https://app.pm2.io/

const Config = {
  default: {
    client: {
      default: {
        metadata: {
          title: 'Default',
          backgroundImage: './src/client/public/default/assets/background/white0-min.jpg',
        },
        components: {
          core: [
            'CommonJs',
            'VanillaJs',
            'Responsive',
            'Keyboard',
            'Translate',
            'Modal',
            'BtnIcon',
            'Logger',
            'Css',
            'NotificationManager',
            'ToggleSwitch',
            'DropDown',
            'LoadingAnimation',
            'EventsUI',
            'AgGrid',
            'Input',
            'Validator',
            'SignUp',
            'LogIn',
            'LogOut',
            'Router',
            'Account',
            'Auth',
            'FullScreen',
            'RichText',
            'Blog',
            'CalendarCore',
            'D3Chart',
            'Stream',
            'SocketIo',
            'Docs',
            'Content',
            'FileExplorer',
            'Chat',
            'Worker',
            'CssCore',
            'Wallet',
            'Badge',
            'ToolTip',
            'Webhook',
            'Recover',
          ],
          default: [
            'MenuDefault',
            'RoutesDefault',
            'ElementsDefault',
            'CommonDefault',
            'CssDefault',
            'LogInDefault',
            'LogOutDefault',
            'SignUpDefault',
            'TranslateDefault',
            'SettingsDefault',
            'SocketIoDefault',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/home',
            title: 'Home',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/settings',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/log-in',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/sign-up',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/log-out',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/account',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/docs',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/recover',
            client: 'Default',
            ssr: 'Default',
          },
          {
            path: '/default-management',
            client: 'Default',
            ssr: 'Default',
          },
        ],
        dists: [
          {
            folder: './node_modules/@neodrag/vanilla/dist/min',
            public_folder: '/dist/@neodrag-vanilla',
            import_name: '@neodrag/vanilla',
            import_name_build: '/dist/@neodrag-vanilla/index.js',
          },
          {
            folder: './node_modules/@fortawesome/fontawesome-free',
            public_folder: '/dist/fontawesome',
          },
          {
            folder: './node_modules/sortablejs/modular',
            public_folder: '/dist/sortablejs',
            import_name: 'sortablejs',
            import_name_build: '/dist/sortablejs/sortable.complete.esm.js',
          },
          {
            folder: './node_modules/validator',
            public_folder: '/dist/validator',
          },
          {
            folder: './node_modules/@loadingio/css-spinner/entries',
            public_folder: '/dist/loadingio',
          },
          {
            import_name: 'ag-grid-community',
            import_name_build: '/dist/ag-grid-community/ag-grid-community.auto.complete.esm.min.js',
            folder: './node_modules/ag-grid-community/dist',
            public_folder: '/dist/ag-grid-community',
            styles: './node_modules/ag-grid-community/styles',
            public_styles_folder: '/styles/ag-grid-community',
          },
          {
            folder: './node_modules/socket.io/client-dist',
            public_folder: '/dist/socket.io',
            import_name: 'socket.io/client-dist/socket.io.esm.min.js',
            import_name_build: '/dist/socket.io/socket.io.esm.min.js',
          },
          {
            folder: './node_modules/peerjs/dist',
            public_folder: '/dist/peerjs',
          },
        ],
        services: ['default', 'core', 'user', 'test', 'file'],
      },
    },
    ssr: {
      Default: {
        head: ['PwaDefault', 'Css', 'DefaultScripts'],
        body: ['CacheControl', 'DefaultSplashScreen'],
      },
    },
    server: {
      'default.net': {
        '/': {
          client: 'default',
          runtime: 'nodejs',
          apis: ['default', 'core', 'user', 'test', 'file'],
          origins: [],
          minifyBuild: false,
          iconsBuild: true,
          lightBuild: false,
          docsBuild: false,
          ws: 'core',
          peer: true,
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'default',
          },
          mailer: {
            sender: {
              email: 'noreply@default.net',
              name: 'Default',
            },
            transport: {
              host: 'smtp.default.com',
              port: 465,
              secure: true,
              auth: {
                user: 'noreply@default.net',
                pass: '',
              },
            },
            templates: {
              userVerifyEmail: 'DefaultVerifyEmail',
              userRecoverEmail: 'DefaultRecoverEmail',
            },
          },
        },
      },
      'www.default.net': {
        '/': {
          client: null,
          runtime: 'nodejs',
          apis: [],
          origins: [],
          minifyBuild: false,
          lightBuild: true,
          proxy: [80, 443],
        },
      },
    },
    dns: {
      ipDaemon: {
        ip: null,
        minutesTimeInterval: 3,
        disabled: false,
      },
      records: {
        A: [
          {
            host: 'example.com',
            dns: 'dondominio',
            api_key: '???',
            user: '???',
          },
        ],
      },
    },
  },
  build: async function (options = { folder: '' }) {
    if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`, { recursive: true });
    fs.writeFileSync(`./tmp/await-deploy`, '', 'utf8');
    if (fs.existsSync(`./engine-private/conf/${process.argv[2]}`)) return loadConf(process.argv[2]);
    if (fs.existsSync(`./engine-private/replica/${process.argv[2]}`)) return loadConf(process.argv[2]);

    if (process.argv[2] === 'deploy') return;

    if (process.argv[2] === 'proxy') {
      this.default.server = {};
      for (const deployId of process.argv[3].split(',')) {
        let confPath = `./engine-private/conf/${deployId}/conf.server.json`;
        const privateConfDevPath = `./engine-private/conf/${deployId}/conf.server.dev.${process.argv[4]}.json`;
        const confDevPath = fs.existsSync(privateConfDevPath)
          ? privateConfDevPath
          : `./engine-private/conf/${deployId}/conf.server.dev.json`;

        if (process.env.NODE_ENV === 'development' && fs.existsSync(confDevPath)) confPath = confDevPath;
        const serverConf = JSON.parse(fs.readFileSync(confPath, 'utf8'));

        for (const host of Object.keys(loadReplicas(serverConf))) {
          if (serverConf[host]['/'])
            this.default.server[host] = {
              ...this.default.server[host],
              ...serverConf[host],
            };
          else
            this.default.server[host] = {
              ...serverConf[host],
              ...this.default.server[host],
            };
        }
      }
    }
    if (!options || !options.folder)
      options = {
        ...options,
        folder: `./conf`,
      };
    if (!fs.existsSync(options.folder)) fs.mkdirSync(options.folder, { recursive: true });
    for (const confType of Object.keys(this.default)) {
      fs.writeFileSync(
        `${options.folder}/conf.${confType}.json`,
        JSON.stringify(this.default[confType], null, 4),
        'utf8',
      );
    }
  },
};

const loadConf = (deployId) => {
  const folder = fs.existsSync(`./engine-private/replica/${deployId}`)
    ? `./engine-private/replica/${deployId}`
    : `./engine-private/conf/${deployId}`;
  if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
  for (const typeConf of Object.keys(Config.default)) {
    let srcConf = fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8');
    if (process.env.NODE_ENV === 'development' && typeConf === 'server') {
      const devConfPath = `${folder}/conf.${typeConf}.dev${process.argv[3] ? `.${process.argv[3]}` : ''}.json`;
      if (fs.existsSync(devConfPath)) srcConf = fs.readFileSync(devConfPath, 'utf8');
    }
    if (typeConf === 'server') srcConf = JSON.stringify(loadReplicas(JSON.parse(srcConf)), null, 4);
    fs.writeFileSync(`./conf/conf.${typeConf}.json`, srcConf, 'utf8');
  }
  fs.writeFileSync(`./.env.production`, fs.readFileSync(`${folder}/.env.production`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.development`, fs.readFileSync(`${folder}/.env.development`, 'utf8'), 'utf8');
  fs.writeFileSync(`./.env.test`, fs.readFileSync(`${folder}/.env.test`, 'utf8'), 'utf8');
  if (process.env.NODE_ENV) {
    fs.writeFileSync(`./.env`, fs.readFileSync(`${folder}/.env.${process.env.NODE_ENV}`, 'utf8'), 'utf8');
    const env = dotenv.parse(fs.readFileSync(`${folder}/.env.${process.env.NODE_ENV}`, 'utf8'));
    process.env = {
      ...process.env,
      ...env,
    };
  }
  fs.writeFileSync(`./package.json`, fs.readFileSync(`${folder}/package.json`, 'utf8'), 'utf8');
  return { folder, deployId };
};

const loadReplicas = (confServer) => {
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      const { replicas, singleReplica } = confServer[host][path];
      if (replicas && (process.argv[2] === 'proxy' || !singleReplica))
        for (const replicaPath of replicas) {
          confServer[host][replicaPath] = newInstance(confServer[host][path]);
          delete confServer[host][replicaPath].replicas;
        }
    }
  }
  return confServer;
};

const getCapVariableName = (value = 'default') => cap(value.replaceAll('-', ' ')).replaceAll(' ', '');

const cloneConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const formattedSrc = (dataConf) =>
    JSON.stringify(dataConf, null, 4)
      .replaceAll(fromClientVariableName, toClientVariableName)
      .replaceAll(fromOptions.clientId, toOptions.clientId);

  const isMergeConf = fs.existsSync(confToFolder);
  if (!isMergeConf) fs.mkdirSync(confToFolder, { recursive: true });

  fs.writeFileSync(
    `${confToFolder}/.env.production`,
    fs.readFileSync(`${confFromFolder}/.env.production`, 'utf8'),
    'utf8',
  );
  fs.writeFileSync(
    `${confToFolder}/.env.development`,
    fs.readFileSync(`${confFromFolder}/.env.development`, 'utf8'),
    'utf8',
  );
  fs.writeFileSync(`${confToFolder}/.env.test`, fs.readFileSync(`${confFromFolder}/.env.test`, 'utf8'), 'utf8');

  for (const confTypeId of ['server', 'client', 'dns', 'ssr']) {
    const confFromData = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.${confTypeId}.json`, 'utf8'));
    fs.writeFileSync(`${confToFolder}/conf.${confTypeId}.json`, formattedSrc(confFromData), 'utf8');
  }

  const packageData = JSON.parse(fs.readFileSync(`${confFromFolder}/package.json`, 'utf8'));
  packageData.scripts.start = packageData.scripts.start.replaceAll(fromOptions.deployId, toOptions.deployId);
  fs.writeFileSync(`${confToFolder}/package.json`, JSON.stringify(packageData, null, 4), 'utf8');
};

const addClientConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  const fromClientConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.client.json`, 'utf8'));

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const { host, path } = toOptions;

  toClientConf[fromOptions.clientId] = fromClientConf[fromOptions.clientId];

  fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(toClientConf, null, 4), 'utf8');

  const toServerConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  const fromServerConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));

  toServerConf[host][path].client = fromOptions.clientId;
  toServerConf[host][path].runtime = 'nodejs';
  toServerConf[host][path].apis = fromClientConf[fromOptions.clientId].services;

  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(toServerConf, null, 4), 'utf8');

  const fromSsrConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.ssr.json`, 'utf8'));
  const toSsrConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.ssr.json`, 'utf8'));

  toSsrConf[fromClientVariableName] = fromSsrConf[fromClientVariableName];

  fs.writeFileSync(`${confToFolder}/conf.ssr.json`, JSON.stringify(toSsrConf, null, 4), 'utf8');
};

const buildClientSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./src/client/components/${fromOptions.clientId}`;
  const confToFolder = `./src/client/components/${toOptions.clientId}`;

  const toClientVariableName = getCapVariableName(toOptions.clientId);
  const fromClientVariableName = getCapVariableName(fromOptions.clientId);

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.clientId, toOptions.clientId);

  const isMergeConf = fs.existsSync(confToFolder);
  if (!isMergeConf) fs.mkdirSync(confToFolder, { recursive: true });

  const files = await fs.readdir(confFromFolder, { recursive: true });
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
  }

  fs.writeFileSync(
    `./src/client/ssr/head-components/${toClientVariableName}Scripts.js`,
    formattedSrc(fs.readFileSync(`./src/client/ssr/head-components/${fromClientVariableName}Scripts.js`, 'utf8')),
    'utf8',
  );

  fs.writeFileSync(
    `./src/client/${toClientVariableName}.js`,
    formattedSrc(fs.readFileSync(`./src/client/${fromClientVariableName}.js`, 'utf8')),
    'utf8',
  );

  fs.copySync(`./src/client/public/${fromOptions.clientId}`, `./src/client/public/${toOptions.clientId}`);
};

const buildApiSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.apiId, toOptions.apiId);

  const apiToFolder = `./src/api/${toOptions.apiId}`;
  const apiFromFolder = `./src/api/${fromOptions.apiId}`;

  const isMergeConf = fs.existsSync(apiToFolder);
  if (!isMergeConf) fs.mkdirSync(apiToFolder, { recursive: true });

  for (const srcApiType of ['model', 'controller', 'service', 'router']) {
    fs.writeFileSync(
      `${apiToFolder}/${toOptions.apiId}.${srcApiType}.js`,
      formattedSrc(fs.readFileSync(`${apiFromFolder}/${fromOptions.apiId}.${srcApiType}.js`, 'utf8')),
      'utf8',
    );
  }

  fs.mkdirSync(`./src/client/services/${toOptions.apiId}`, { recursive: true });
  if (fs.existsSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.service.js`))
    fs.writeFileSync(
      `./src/client/services/${toOptions.apiId}/${toOptions.apiId}.service.js`,
      formattedSrc(
        fs.readFileSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.service.js`, 'utf8'),
      ),
      'utf8',
    );
  return;
  if (fs.existsSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.management.js`))
    fs.writeFileSync(
      `./src/client/services/${toOptions.apiId}/${toOptions.apiId}.management.js`,
      formattedSrc(
        fs.readFileSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.management.js`, 'utf8'),
      ),
      'utf8',
    );
};

const addApiConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'dd-default', clientId: 'default' },
) => {
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const confServer = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host]))
      if (confServer[host][path].apis) confServer[host][path].apis.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');

  const confClient = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  confClient[toOptions.clientId].services.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(confClient, null, 4), 'utf8');
};

const addWsConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' },
) => {
  if (!fromOptions.wsId) fromOptions.wsId = fromDefaultOptions.wsId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.host) fromOptions.host = fromDefaultOptions.host;
  if (!fromOptions.paths) fromOptions.paths = fromDefaultOptions.paths;

  const toClientVariableName = getCapVariableName(toOptions.apiId);
  const fromClientVariableName = getCapVariableName(fromOptions.apiId);

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const paths = toOptions.paths.split(',');

  const confServer = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host]))
      if (host === toOptions.host && paths.includes(path) && confServer[host][path])
        confServer[host][path].ws = toOptions.wsId;
  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');
};

const buildWsSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { wsId: 'default', deployId: 'dd-default', host: 'default.net', paths: '/' },
) => {
  if (!fromOptions.wsId) fromOptions.wsId = fromDefaultOptions.wsId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.host) fromOptions.host = fromDefaultOptions.host;
  if (!fromOptions.paths) fromOptions.paths = fromDefaultOptions.paths;

  const toClientVariableName = getCapVariableName(toOptions.wsId);
  const fromClientVariableName = getCapVariableName(fromOptions.wsId);

  const confFromFolder = `./src/ws/${fromOptions.wsId}`;
  const confToFolder = `./src/ws/${toOptions.wsId}`;

  const paths = toOptions.paths.split(',');

  const formattedSrc = (src) =>
    src.replaceAll(fromClientVariableName, toClientVariableName).replaceAll(fromOptions.wsId, toOptions.wsId);

  const files = await fs.readdir(confFromFolder, { recursive: true });
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    if (fs.lstatSync(fromFilePath).isDirectory() && !fs.existsSync(formattedSrc(toFilePath)))
      fs.mkdirSync(formattedSrc(toFilePath), { recursive: true });

    if (fs.lstatSync(fromFilePath).isFile() && !fs.existsSync(formattedSrc(toFilePath))) {
      fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
    }
  }
};

const cloneSrcComponents = async ({ toOptions, fromOptions }) => {
  const toClientVariableName = getCapVariableName(toOptions.componentsFolder);
  const fromClientVariableName = getCapVariableName(fromOptions.componentsFolder);

  const formattedSrc = (src) =>
    src
      .replaceAll(fromClientVariableName, toClientVariableName)
      .replaceAll(fromOptions.componentsFolder, toOptions.componentsFolder);

  const confFromFolder = `./src/client/components/${fromOptions.componentsFolder}`;
  const confToFolder = `./src/client/components/${toOptions.componentsFolder}`;

  fs.mkdirSync(confToFolder, { recursive: true });

  const files = await fs.readdir(confFromFolder);
  for (const relativePath of files) {
    const fromFilePath = dir.resolve(`${confFromFolder}/${relativePath}`);
    const toFilePath = dir.resolve(`${confToFolder}/${relativePath}`);

    fs.writeFileSync(formattedSrc(toFilePath), formattedSrc(fs.readFileSync(fromFilePath, 'utf8')), 'utf8');
  }
};

const buildProxyRouter = () => {
  const confServer = JSON.parse(fs.readFileSync(`./conf/conf.server.json`, 'utf8'));
  let currentPort = parseInt(process.env.PORT) + 1;
  const proxyRouter = {};
  const singleReplicaHosts = [];
  for (const host of Object.keys(confServer)) {
    for (const path of Object.keys(confServer[host])) {
      if (confServer[host][path].singleReplica && !singleReplicaHosts.includes(host)) {
        singleReplicaHosts.push(host);
        currentPort++;
        continue;
      }
      confServer[host][path].port = newInstance(currentPort);
      for (const port of confServer[host][path].proxy) {
        if (!(port in proxyRouter)) proxyRouter[port] = {};
        proxyRouter[port][`${host}${path}`] = {
          // target: `http://${host}:${confServer[host][path].port}${path}`,
          target: `http://localhost:${confServer[host][path].port - singleReplicaHosts.length}`,
          // target: `http://127.0.0.1:${confServer[host][path].port}`,
          proxy: confServer[host][path].proxy,
          redirect: confServer[host][path].redirect,
          host,
          path,
        };
      }
      currentPort++;
      if (confServer[host][path].peer) {
        const peerPath = path === '/' ? `/peer` : `${path}/peer`;
        confServer[host][peerPath] = newInstance(confServer[host][path]);
        confServer[host][peerPath].port = newInstance(currentPort);
        for (const port of confServer[host][path].proxy) {
          if (!(port in proxyRouter)) proxyRouter[port] = {};
          proxyRouter[port][`${host}${peerPath}`] = {
            // target: `http://${host}:${confServer[host][peerPath].port}${peerPath}`,
            target: `http://localhost:${confServer[host][peerPath].port - singleReplicaHosts.length}`,
            // target: `http://127.0.0.1:${confServer[host][peerPath].port}`,
            proxy: confServer[host][peerPath].proxy,
            host,
            path: peerPath,
          };
        }
        currentPort++;
      }
    }
  }
  return proxyRouter;
};

const cliBar = async (time = 5000) => {
  // create new progress bar
  const b = new cliProgress.SingleBar({
    format: 'Delay | {bar} | {percentage}% || {value}/{total} Chunks || Speed: {speed}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });

  const maxValueDisplay = 200;
  const minValueDisplay = 0;
  const steps = 10;
  const incrementValue = 200 / steps;
  const delayTime = time / steps;
  // initialize the bar - defining payload token "speed" with the default value "N/A"
  b.start(maxValueDisplay, minValueDisplay, {
    speed: 'N/A',
  });

  // update values
  // b1.increment();
  // b1.update(20);

  for (const step of range(1, steps)) {
    b.increment(incrementValue);
    await timer(delayTime);
  }

  // stop the bar
  b.stop();
};

const cliSpinner = async (time = 5000, message0, message1, color, type = 'dots') => {
  const { frames, interval } = cliSpinners[type];
  const steps = parseInt(time / interval);
  let index = 0;
  for (const step of range(1, steps)) {
    const msg = `${message0 ? message0 : ''}${frames[index]}${message1 ? message1 : ''}`;
    logUpdate(color ? msg[color] : msg);
    await timer(interval);
    index++;
    if (index === frames.length) index = 0;
  }
};

export {
  Config,
  loadConf,
  loadReplicas,
  cloneConf,
  getCapVariableName,
  buildClientSrc,
  buildApiSrc,
  addApiConf,
  addClientConf,
  addWsConf,
  buildWsSrc,
  cloneSrcComponents,
  buildProxyRouter,
  cliBar,
  cliSpinner,
};
