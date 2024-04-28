import fs from 'fs-extra';
import dotenv from 'dotenv';
import { cap, newInstance } from '../client/components/core/CommonJs.js';
import * as dir from 'path';

// monitoring: https://app.pm2.io/

const Config = {
  default: {
    client: {
      default: {
        metadata: {
          title: 'App',
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
            'ToolBar',
            'HomeBackground',
            'Worker',
          ],
          default: [
            'Menu',
            'RoutesDefault',
            'Elements',
            'CommonDefault',
            'CssDefault',
            'LogInDefault',
            'LogOutDefault',
            'SignUpDefault',
            'TranslateDefault',
            'Settings',
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
        ],
        services: ['core', 'user', 'test'],
      },
    },
    ssr: {
      Default: {
        head: ['DefaultScripts'],
        body: [],
      },
    },
    server: {
      'default.net': {
        '/': {
          client: 'default',
          runtime: 'nodejs',
          apis: ['user', 'test'],
          origins: [],
          minifyBuild: false,
          lightBuild: false,
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'default',
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
    if (fs.existsSync(`./engine-private/conf/${process.argv[2]}`)) return loadConf(process.argv[2]);
    if (process.argv[2] === 'deploy') return;
    if (process.argv[2] === 'proxy') {
      this.default.server = {};
      for (const deployId of process.argv[3].split(',')) {
        const serverConf = loadReplicas(
          JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
        );
        // this.default.server = {
        //   ...this.default.server,
        //   ...serverConf,
        // };
        for (const host of Object.keys(serverConf)) {
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
  const folder = `./engine-private/conf/${deployId}`;
  if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
  for (const typeConf of Object.keys(Config.default)) {
    let srcConf = fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8');
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
      const { replicas } = confServer[host][path];
      if (replicas)
        for (const replicaPath of replicas) {
          confServer[host][replicaPath] = newInstance(confServer[host][path]);
          delete confServer[host][replicaPath].replicas;
        }
    }
  }
  return confServer;
};

const buildClientVariableName = (clientId = 'default') => cap(clientId.replaceAll('-', ' ')).replaceAll(' ', '');

const cloneConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { deployId: 'default-3001', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientVariableName = buildClientVariableName(toOptions.clientId);
  const fromClientVariableName = buildClientVariableName(fromOptions.clientId);

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
  fromDefaultOptions = { deployId: 'default-3001', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const toClientConf = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  const fromClientConf = JSON.parse(fs.readFileSync(`${confFromFolder}/conf.client.json`, 'utf8'));

  const toClientVariableName = buildClientVariableName(toOptions.clientId);
  const fromClientVariableName = buildClientVariableName(fromOptions.clientId);

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
  fromDefaultOptions = { deployId: 'default-3001', clientId: 'default' },
) => {
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const confFromFolder = `./src/client/components/${fromOptions.clientId}`;
  const confToFolder = `./src/client/components/${toOptions.clientId}`;

  const toClientVariableName = buildClientVariableName(toOptions.clientId);
  const fromClientVariableName = buildClientVariableName(fromOptions.clientId);

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

  const themeRenderer = ` 'css-default': async (options) => {
    const htmlRender = Css.currentTheme !== 'css-default';
    if (options) addTheme(options);
    if (htmlRender) {
      Css.currentTheme = 'css-default';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css['dark-light']();
      await Css['css-default']();
      await Css.toolbar();
      darkTheme = true;
      AgGrid.changeTheme({ darkTheme });
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'fontawesome', htmlRender }) };
  },
  'css-default-light': async (options) => {
    const htmlRender = Css.currentTheme !== 'css-default-light';
    if (options) addTheme(options);
    if (htmlRender) {
      Css.currentTheme = 'css-default-light';
      htmls('.theme', '');
      await Css.fontawesome();
      await Css.default();
      await Css['css-default-light']();
      await Css.toolbar();
      darkTheme = false;
      AgGrid.changeTheme({ darkTheme });
    }
    return { ...renderDefaultWindowsModalButtonContent({ barButtonsIconTheme: 'fontawesome', htmlRender }) };
  },
  /*css-render-theme*/`.replaceAll('css-default', `css-${toOptions.clientId}`);

  fs.writeFileSync(
    `./src/client/components/core/Css.js`,
    fs.readFileSync(`./src/client/components/core/Css.js`, 'utf8').replaceAll(`/*css-render-theme*/`, themeRenderer),
    'utf8',
  );
};

const buildApiSrc = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'default-3001', clientId: 'default' },
) => {
  fromOptions = {
    ...fromDefaultOptions,
    ...fromOptions,
  };
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = buildClientVariableName(toOptions.apiId);
  const fromClientVariableName = buildClientVariableName(fromOptions.apiId);

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

  fs.writeFileSync(
    `./src/db/mongoose/MongooseDB.js`,
    fs
      .readFileSync(`./src/db/mongoose/MongooseDB.js`, 'utf8')
      .replaceAll(
        `/*import-render*/`,
        `import { ${toClientVariableName}Schema } from '../../api/${toOptions.apiId}/${toOptions.apiId}.model.js';
/*import-render*/`,
      )
      .replaceAll(
        `/*case-render*/`,
        `case '${toOptions.apiId}':
          models.${toClientVariableName} = conn.model('${toClientVariableName}', ${toClientVariableName}Schema);
          break;
        /*case-render*/`,
      ),
    'utf8',
  );

  fs.mkdirSync(`./src/client/services/${toOptions.apiId}`, { recursive: true });
  fs.writeFileSync(
    `./src/client/services/${toOptions.apiId}/${toOptions.apiId}.service.js`,
    formattedSrc(fs.readFileSync(`./src/client/services/${fromOptions.apiId}/${fromOptions.apiId}.service.js`, 'utf8')),
    'utf8',
  );
};

const addApiConf = async (
  { toOptions, fromOptions },
  fromDefaultOptions = { apiId: 'default', deployId: 'default-3001', clientId: 'default' },
) => {
  fromOptions = {
    ...fromDefaultOptions,
    ...fromOptions,
  };
  if (!fromOptions.apiId) fromOptions.apiId = fromDefaultOptions.apiId;
  if (!fromOptions.deployId) fromOptions.deployId = fromDefaultOptions.deployId;
  if (!fromOptions.clientId) fromOptions.clientId = fromDefaultOptions.clientId;

  const toClientVariableName = buildClientVariableName(toOptions.apiId);
  const fromClientVariableName = buildClientVariableName(fromOptions.apiId);

  const confFromFolder = `./engine-private/conf/${fromOptions.deployId}`;
  const confToFolder = `./engine-private/conf/${toOptions.deployId}`;

  const confServer = JSON.parse(fs.readFileSync(`${confToFolder}/conf.server.json`, 'utf8'));
  for (const host of Object.keys(confServer))
    for (const path of Object.keys(confServer[host]))
      if (confServer[host][path].apis) confServer[host][path].apis.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.server.json`, JSON.stringify(confServer, null, 4), 'utf8');

  const confClient = JSON.parse(fs.readFileSync(`${confToFolder}/conf.client.json`, 'utf8'));
  confClient[fromOptions.clientId].services.push(toOptions.apiId);
  fs.writeFileSync(`${confToFolder}/conf.client.json`, JSON.stringify(confClient, null, 4), 'utf8');
};

export {
  Config,
  loadConf,
  loadReplicas,
  cloneConf,
  buildClientVariableName,
  buildClientSrc,
  buildApiSrc,
  addApiConf,
  addClientConf,
};
