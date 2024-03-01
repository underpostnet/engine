import fs from 'fs-extra';
import { shellExec } from './process.js';

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
          keywords: ['cyberia, MMORPG, browser, free, MMO'],
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
        services: ['core', 'file', 'user', 'cyberia-user', 'cyberia-biome', 'cyberia-tile', 'cyberia-world'],
      },
    },
    ssr: {
      Cyberia: {
        head: ['Seo', 'Pwa', 'Microdata', 'CyberiaScripts'],
        body: ['CyberiaSplashScreen'],
      },
    },
    server: {
      'www.example1.com': {
        '/': {
          client: 'cyberia',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
      },
      'www.cyberiaonline.com': {
        '/': {
          client: 'cyberia',
          apis: ['file', 'user', 'cyberia-user', 'cyberia-biome', 'cyberia-tile', 'cyberia-world'],
          wss: ['cyberia'],
          runtime: 'nodejs',
          origins: [],
          disabled: false,
          minifyBuild: false,
          lightBuild: true, //
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'example2-cyberia',
          },
          mailer: {
            sender: {
              email: '',
              name: '',
            },
            transport: {
              host: 'mail.net', // smtp host
              port: 465,
              secure: true, // true for 465, false for other ports
              auth: {
                user: '', // generated ethereal user
                pass: '', // generated ethereal password
              },
            },
            templates: [''],
          },
        },
        '/game': {
          client: 'cyberia',
          apis: ['file', 'user', 'cyberia-user', 'cyberia-biome', 'cyberia-tile', 'cyberia-world'],
          wss: ['cyberia'],
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          minifyBuild: false,
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'example2-cyberia',
          },
        },
        '/bms': {
          client: 'bms',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
      },
      'example1.com': {
        '/': {
          client: 'test',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
        '/docs': {
          client: 'doc',
          runtime: 'xampp',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
      },
    },
    dns: {
      ipDaemon: {
        ip: null,
        minutesTimeInterval: 3,
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
  build: async function () {
    // fs.removeSync('./public');
    fs.removeSync('./logs');
    fs.removeSync('./conf');
    shellExec(`node bin/util update-conf-client`);
    if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
    if (!fs.existsSync(`./tmp`)) fs.mkdirSync(`./tmp`);
    for (const confType of Object.keys(this.default)) {
      if (false && fs.existsSync(`./engine-private/conf/conf.${confType}.private.json`))
        fs.writeFileSync(
          `./conf/conf.${confType}.json`,
          fs.readFileSync(`./engine-private/conf/conf.${confType}.private.json`, 'utf8'),
          'utf8',
        );
      else if (!fs.existsSync(`./conf/conf.${confType}.json`))
        fs.writeFileSync(`./conf/conf.${confType}.json`, JSON.stringify(this.default[confType], null, 4), 'utf8');
    }
  },
};

export { Config };
