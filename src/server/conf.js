import fs from 'fs-extra';

const Config = {
  default: {
    client: {
      doc: {
        components: {},
        views: [],
        dists: [],
      },
      wordpress: {
        components: {},
        views: [],
        dists: [],
      },
      mysql_test: {
        components: {},
        views: [],
        dists: [],
      },
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
      cryptokoyn: {
        metadata: {
          title: 'Cryptokoyn',
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
          cryptokoyn: [
            'Menu',
            'RoutesCryptokoyn',
            'Elements',
            'CommonCryptokoyn',
            'CssCryptokoyn',
            'LogInCryptokoyn',
            'LogOutCryptokoyn',
            'SignUpCryptokoyn',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
          },
          {
            path: '/settings',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
          },
          {
            path: '/log-in',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
          },
          {
            path: '/sign-up',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
          },
          {
            path: '/log-out',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
          },
          {
            path: '/account',
            client: 'Cryptokoyn',
            ssr: 'Cryptokoyn',
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
      dogmadual: {
        metadata: {
          title: 'DOGMADUAL.com',
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
          dogmadual: [
            'Menu',
            'RoutesDogmadual',
            'Elements',
            'CommonDogmadual',
            'CssDogmadual',
            'LogInDogmadual',
            'LogOutDogmadual',
            'SignUpDogmadual',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
          },
          {
            path: '/settings',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
          },
          {
            path: '/log-in',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
          },
          {
            path: '/sign-up',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
          },
          {
            path: '/log-out',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
          },
          {
            path: '/account',
            client: 'Dogmadual',
            ssr: 'Dogmadual',
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
      nexodev: {
        metadata: {
          title: `nexodev.org`,
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
          nexodev: [
            'Menu',
            'RoutesNexodev',
            'Elements',
            'CommonNexodev',
            'CssNexodev',
            'LogInNexodev',
            'LogOutNexodev',
            'SignUpNexodev',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Nexodev',
            ssr: 'Nexodev',
          },
          {
            path: '/settings',
            client: 'Nexodev',
            ssr: 'Nexodev',
          },
          {
            path: '/log-in',
            client: 'Nexodev',
            ssr: 'Nexodev',
          },
          {
            path: '/sign-up',
            client: 'Nexodev',
            ssr: 'Nexodev',
          },
          {
            path: '/log-out',
            client: 'Nexodev',
            ssr: 'Nexodev',
          },
          {
            path: '/account',
            client: 'Nexodev',
            ssr: 'Nexodev',
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
      test: {
        components: {
          core: ['CommonJs', 'VanillaJs', 'Responsive', 'Keyboard', 'Translate', 'Modal', 'BtnIcon', 'Logger', 'Css'],
          test: ['Test'],
        },
        views: [
          {
            path: '/',
            title: 'Test',
            client: 'Test',
          },
          {
            path: '/test',
            title: 'Test',
            client: 'Test',
          },
          {
            path: '/drag',
            title: 'Drag Example',
            client: 'DragExample',
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
        ],
      },
      bms: {
        components: {
          core: [
            'Router',
            'CommonJs',
            'VanillaJs',
            'Responsive',
            'Keyboard',
            'Translate',
            'Modal',
            'BtnIcon',
            'Logger',
            'Css',
            'AgGrid',
            'Input',
            'DropDown',
            'ToggleSwitch',
          ],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Bms',
          },
        ],
        dists: [
          {
            folder: './node_modules/@fortawesome/fontawesome-free',
            public_folder: '/dist/fontawesome',
          },
          {
            folder: './node_modules/@neodrag/vanilla/dist/min',
            public_folder: '/dist/@neodrag-vanilla',
            import_name: '@neodrag/vanilla',
            import_name_build: '/dist/@neodrag-vanilla/index.js',
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
      },
      cyberia: {
        metadata: {
          title: `CYBERIA`,
          description: `Browser massively multiplayer online role-playing game. Immerse yourself in an exciting
          cyberpunk world with our pixel art MMORPG. Explore a dynamic online universe right from your browser.`,
          keywords: ['cyberia', 'MMORPG', 'browser', 'free', 'MMO'],
          author: 'https://github.com/underpostnet',
          thumbnail: 'assets/splash/CYBERIA.jpg',
          themeColor: '#1a1a1a',
        },
        components: {
          core: [
            'CommonJs',
            'VanillaJs',
            'Responsive',
            'Keyboard',
            'SocketIo',
            'Translate',
            'Modal',
            'BtnIcon',
            'Logger',
            'Css',
            'ColorPalette',
            'NotificationManager',
            'ToggleSwitch',
            'DropDown',
            'LoadingAnimation',
            'EventsUI',
            'AgGrid',
            'Input',
            'Validator',
            'Polyhedron',
            'SignUp',
            'LogIn',
            'LogOut',
            'Chat',
            'Router',
            'Account',
            'Auth',
            'JoyStick',
            'Worker',
            'Webhook',
            'Wallet',
            'BlockChain',
            'FileExplorer',
          ],
          cyberia: [
            'Pixi',
            'Matrix',
            'Elements',
            'Menu',
            'TranslateCyberia',
            'Settings',
            'Bag',
            'JoyStickCyberia',
            'Biome',
            'Tile',
            'CssCyberia',
            'World',
            'MainUser',
            'Universe',
            'CommonCyberia',
            'SocketIoCyberia',
            'LogInCyberia',
            'LogOutCyberia',
            'SignUpCyberia',
            'RoutesCyberia',
            'Skill',
            'PointAndClickMovement',
            'CyberiaWebhook',
            'Character',
            'InteractionPanel',
          ],
          test: ['Test'],
        },
        views: [
          {
            path: '/',
            title: 'MMORPG',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/bag',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/colors',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/settings',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/log-in',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/sign-up',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/log-out',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/chat',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/biome',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/tile',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/3d',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/world',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/account',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/wallet',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/character',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/blockchain',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/cloud',
            client: 'Cyberia',
            ssr: 'Cyberia',
          },
          {
            path: '/test',
            title: 'Test',
            client: 'Test',
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
            folder: './node_modules/pixi.js/dist',
            public_folder: '/dist/pixi.js',
            import_name: 'pixi.js',
            import_name_build: '/dist/pixi.js/pixi.min.mjs',
          },
          {
            folder: './node_modules/socket.io/client-dist',
            public_folder: '/dist/socket.io',
            import_name: 'socket.io/client-dist/socket.io.esm.min.js',
            import_name_build: '/dist/socket.io/socket.io.esm.min.js',
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
            folder: './node_modules/joystick-controller/dist/es',
            public_folder: '/dist/joystick-controller',
            import_name: 'joystick-controller',
            import_name_build: '/dist/joystick-controller/joystick-controller.js',
          },
          {
            folder: './node_modules/pathfinding/visual/lib',
            public_folder: '/dist/pathfinding',
            import_name: 'pathfinding',
            import_name_build: '/dist/pathfinding/pathfinding-browser.min.js',
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
        services: [
          'core',
          'file',
          'user',
          'crypto',
          'blockchain',
          'ipfs',
          'bucket',
          'cyberia-user',
          'cyberia-biome',
          'cyberia-tile',
          'cyberia-world',
        ],
      },
    },
    ssr: {
      Cyberia: {
        head: ['Seo', 'Pwa', 'Microdata', 'CyberiaScripts'],
        body: ['CyberiaSplashScreen'],
      },
      Nexodev: {
        head: ['NexodevScripts'],
        body: [],
      },
      Dogmadual: {
        head: ['DogmadualScripts'],
        body: [],
      },
      Cryptokoyn: {
        head: ['CryptokoynScripts'],
        body: [],
      },
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
          disabled: false,
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
        disabled: true,
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
  fs.writeFileSync(`./package.json`, fs.readFileSync(`${folder}/package.json`, 'utf8'), 'utf8');
  return { folder, deployId };
};

export { Config, loadConf };
