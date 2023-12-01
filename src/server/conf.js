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
      cyberia: {
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
            'FullScreen',
            'LoadingAnimation',
            'EventsUI',
            'AgGrid',
          ],
          cyberia: [
            'Pixi',
            'Matrix',
            'Event',
            'Elements',
            'Menu',
            'TranslateCyberia',
            'Settings',
            'Bag',
            'JoyStick',
            'Biome',
          ],
          test: ['Test'],
        },
        views: [
          {
            path: '/',
            title: 'Home',
            client: 'Main',
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
            import_name: 'socket.io/client-dist/socket.io.esm.min.js',
            import_name_build: '/socket.io/socket.io.esm.min.js',
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
            folder: './node_modules/virtual-joystick',
            public_folder: '/dist/virtual-joystick',
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
        services: ['core', 'file', 'cyberia-biome'],
      },
    },
    server: {
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
      'www.example1.com': {
        '/': {
          client: 'cyberia',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
      },
      'www.example2.com': {
        '/': {
          client: 'test',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
        '/path': {
          client: 'test',
          runtime: 'nodejs',
          origins: [],
          disabled: true,
          proxy: [80, 443],
        },
        '/cyberia': {
          client: 'cyberia',
          apis: ['file', 'cyberia-biome'],
          runtime: 'nodejs',
          origins: [],
          disabled: false,
          proxy: [80, 443],
          db: {
            provider: 'mongoose',
            host: 'mongodb://127.0.0.1:27017',
            name: 'example2-cyberia',
          },
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
    fs.removeSync('./public');
    fs.removeSync('./logs');
    fs.removeSync('./conf');
    shellExec(`node bin/util update-conf-client`);
    if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
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
