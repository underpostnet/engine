import fs from 'fs';

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
          ],
          cyberia: ['Pixi', 'Matrix', 'Event', 'Elements', 'Menu'],
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
        ],
      },
    },
    server: {
      'example1.com': {
        '/docs': {
          client: 'doc',
          runtime: 'xampp',
          origins: [],
          disabled: false,
          proxy: [80, 443],
        },
        '/': {
          client: 'test',
          runtime: 'nodejs',
          origins: [],
          disabled: false,
          proxy: [80, 443],
        },
      },
      'www.example2.com': {
        '/cyberia': {
          client: 'cyberia',
          runtime: 'nodejs',
          origins: [],
          disabled: false,
          proxy: [80, 443],
        },
        '/': {
          client: 'test',
          runtime: 'nodejs',
          origins: [],
          disabled: false,
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
    if (!fs.existsSync(`./conf`)) fs.mkdirSync(`./conf`);
    for (const confType of Object.keys(this.default)) {
      if (fs.existsSync(`./engine-private/conf/conf.${confType}.private.json`))
        fs.writeFileSync(
          `./conf/conf.${confType}.json`,
          fs.readFileSync(`./engine-private/conf/conf.${confType}.private.json`, 'utf8'),
          'utf8'
        );
      else if (!fs.existsSync(`./conf/conf.${confType}.json`))
        fs.writeFileSync(`./conf/conf.${confType}.json`, JSON.stringify(this.default[confType], null, 4), 'utf8');
    }
  },
};

export { Config };
