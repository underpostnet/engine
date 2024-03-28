import fs from 'fs-extra';
import dotenv from 'dotenv';

// monitoring: https://app.pm2.io/

const Config = {
  default: {
    client: {
      underpost: {
        metadata: {
          title: 'underpost.net',
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
          ],
          underpost: [
            'Menu',
            'RoutesUnderpost',
            'Elements',
            'CommonUnderpost',
            'CssUnderpost',
            'LogInUnderpost',
            'LogOutUnderpost',
            'SignUpUnderpost',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Underpost',
            ssr: 'Underpost',
          },
          {
            path: '/settings',
            client: 'Underpost',
            ssr: 'Underpost',
          },
          {
            path: '/log-in',
            client: 'Underpost',
            ssr: 'Underpost',
          },
          {
            path: '/sign-up',
            client: 'Underpost',
            ssr: 'Underpost',
          },
          {
            path: '/log-out',
            client: 'Underpost',
            ssr: 'Underpost',
          },
          {
            path: '/account',
            client: 'Underpost',
            ssr: 'Underpost',
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
        services: ['core', 'user'],
      },
    },
    ssr: {
      Underpost: {
        head: ['UnderpostScripts'],
        body: [],
      },
    },
    server: {
      'underpost.net': {
        '/': {
          client: 'underpost',
          runtime: 'nodejs',
          apis: ['user'],
          origins: [],
          minifyBuild: false,
          lightBuild: false,
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'underpost',
          },
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
        const serverConf = JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8'));
        this.default.server = {
          ...this.default.server,
          ...serverConf,
        };
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
  for (const typeConf of Object.keys(Config.default))
    fs.writeFileSync(
      `./conf/conf.${typeConf}.json`,
      fs.readFileSync(`${folder}/conf.${typeConf}.json`, 'utf8'),
      'utf8',
    );
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

export { Config, loadConf };
