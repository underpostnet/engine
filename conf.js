const DefaultConf = /**/ {
  client: {
    default: {
      metadata: {
        title: 'PWA Demo App',
        backgroundImage: 'assets/background/white0-min.jpg',
        description: 'Web application',
        keywords: ['web', 'app', 'spa', 'demo', 'github-pages'],
        author: 'https://github.com/underpostnet',
        thumbnail: 'android-chrome-384x384.png',
        themeColor: '#ececec',
        pwaAssetsPath: '',
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
          'PublicProfile',
          'Auth',
          'FullScreen',
          'RichText',
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
          'Panel',
          'PanelForm',
          'Scroll',
          'Alert',
          '404',
          '500',
          'Pagination',
          'windowGetDimensions',
          'SearchBox',
          'SocketIoHandler',
          'AppStore',
          'ClientEvents',
          'EventBus',
        ],
        default: [
          'AppShellDefault',
          'RouterDefault',
          'AppStoreDefault',
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
        { path: '/', title: 'Home', client: 'Default', ssr: 'Default' },
        { path: '/home', title: 'Home', client: 'Default', ssr: 'Default' },
        { path: '/settings', client: 'Default', ssr: 'Default' },
        { path: '/log-in', client: 'Default', ssr: 'Default' },
        { path: '/sign-up', client: 'Default', ssr: 'Default' },
        { path: '/log-out', client: 'Default', ssr: 'Default' },
        { path: '/account', client: 'Default', ssr: 'Default' },
        { path: '/docs', client: 'Default', ssr: 'Default' },
        { path: '/recover', client: 'Default', ssr: 'Default' },
        { path: '/u', client: 'Default', ssr: 'Default' },
        { path: '/default-management', client: 'Default', ssr: 'Default' },
        { client: 'Default', ssr: 'Default', path: '/404', title: '404 Not Found' },
        { client: 'Default', ssr: 'Default', path: '/500', title: '500 Server Error' },
        { path: '/blog', client: 'Default', ssr: 'Default' },
        { path: '/chat', client: 'Default', ssr: 'Default' },
      ],
      dists: [
        {
          folder: './node_modules/@neodrag/vanilla/dist/min',
          public_folder: '/dist/@neodrag-vanilla',
          import_name: '@neodrag/vanilla',
          import_name_build: '/dist/@neodrag-vanilla/index.js',
        },
        { folder: './node_modules/@fortawesome/fontawesome-free', public_folder: '/dist/fontawesome' },
        {
          folder: './node_modules/sortablejs/modular',
          public_folder: '/dist/sortablejs',
          import_name: 'sortablejs',
          import_name_build: '/dist/sortablejs/sortable.complete.esm.js',
        },
        { folder: './node_modules/validator', public_folder: '/dist/validator' },
        { folder: './node_modules/easymde/dist', public_folder: '/dist/easymde' },
        {
          folder: './node_modules/marked/lib',
          public_folder: '/dist/marked',
          import_name: 'marked',
          import_name_build: '/dist/marked/marked.esm.js',
        },
        {
          folder: './node_modules/vanilla-jsoneditor/standalone.js',
          public_folder: '/dist/vanilla-jsoneditor/standalone.js',
          import_name: 'vanilla-jsoneditor',
          import_name_build: '/dist/vanilla-jsoneditor/standalone.js',
        },
        {
          import_name: 'ag-grid-community',
          import_name_build: '/dist/ag-grid-community/ag-grid-community.min.js',
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
          folder: './node_modules/dexie/dist',
          public_folder: '/dist/dexie',
          import_name: 'dexie',
          import_name_build: '/dist/dexie/dexie.mjs',
        },
        { folder: './node_modules/peerjs/dist', public_folder: '/dist/peerjs' },
      ],
      services: ['default', 'core', 'user', 'test', 'file', 'document', 'instance', 'crypto'],
    },
  },
  ssr: {
    Default: {
      head: ['Seo', 'Pwa', 'Css', 'DefaultScripts', 'Production'],
      body: ['CacheControl', 'DefaultSplashScreen', '404', '500', 'SwaggerDarkMode'],
      mailer: { userVerifyEmail: 'DefaultVerifyEmail', userRecoverEmail: 'DefaultRecoverEmail' },
      views: [
        {
          path: '/offline',
          title: 'No Network Connection',
          client: 'NoNetworkConnection',
          head: [],
          body: [],
          offlineDefault: true,
        },
        {
          path: '/maintenance',
          title: 'Server Maintenance',
          client: 'Maintenance',
          head: [],
          body: [],
          maintenanceDefault: true,
        },
        { path: '/test', title: 'Test', client: 'Test', head: [], body: [] },
      ],
    },
  },
  server: {
    'default.net': {
      '/': {
        client: 'default',
        runtime: 'nodejs',
        apis: ['default', 'core', 'user', 'test', 'file', 'document', 'instance', 'crypto'],
        origins: [],
        ws: 'core',
        peer: true,
        proxy: [80, 443],
        db: {
          provider: 'env:DB_PROVIDER:mongoose',
          host: 'env:DB_HOST:mongodb://127.0.0.1:27017',
          name: 'env:DB_NAME:default',
          replicaSet: 'env:DB_REPLICA_SET:rs0',
          authSource: 'env:DB_AUTH_SOURCE:admin',
          user: 'env:DB_USER:',
          password: 'env:DB_PASSWORD:',
        },
        mailer: {
          sender: { email: 'env:MAILER_SENDER_EMAIL:noreply@default.net', name: 'env:MAILER_SENDER_NAME:Default' },
          transport: {
            host: 'env:SMTP_HOST:smtp.default.com',
            port: 'env:SMTP_PORT:int:465',
            secure: 'env:SMTP_SECURE:bool:true',
            auth: { user: 'env:SMTP_AUTH_USER:', pass: 'env:SMTP_AUTH_PASS:' },
          },
        },
        valkey: { port: 'env:VALKEY_PORT:int:6379', host: 'env:VALKEY_HOST:127.0.0.1' },
      },
    },
    'www.default.net': { '/': { client: null, runtime: 'nodejs', apis: [], origins: [], proxy: [80, 443] } },
  },
  cron: {
    records: {
      A: [
        {
          host: 'env:DDNS_HOST:example.com',
          dns: 'env:DDNS_PROVIDER:dondominio',
          api_key: 'env:DDNS_API_KEY:',
          user: 'env:DDNS_USER:',
        },
      ],
    },
    jobs: {
      dns: { expression: '* * * * *', enabled: true, instances: 1 },
      backups: { expression: '0 1 * * *', enabled: true, instances: 1 },
    },
  },
  wireguard: {
    '00.000.00.000': {
      interfaceName: 'wg0',
      listenPort: 51820,
      address: '10.0.0.1/24',
      publicKey: '',
      sshForwardPort: 2222,
      peers: [
        {
          id: 'homelab-a',
          address: '10.0.0.2',
          managementHost: '192.168.1.80',
          publicKey: '',
          allowedIPs: ['10.0.0.2/32'],
          hosts: [],
          instances: [],
          default: true,
        },
      ],
    },
  },
  event: {
    'notification-providers': {
      'default-cluster-mailer-provider': {
        type: 'mailer',
        mailer: {
          sender: {
            email: 'env:CLUSTER_MAILER_SENDER_EMAIL',
            name: 'env:CLUSTER_MAILER_SENDER_NAME:Underpost',
          },
          transport: {
            host: 'env:CLUSTER_MAILER_SMTP_HOST',
            port: 'env:CLUSTER_MAILER_SMTP_PORT:int:587',
            secure: 'env:CLUSTER_MAILER_SMTP_SECURE:bool:false',
            auth: {
              user: 'env:CLUSTER_MAILER_SMTP_AUTH_USER',
              pass: 'env:CLUSTER_MAILER_SMTP_AUTH_PASS',
            },
          },
        },
      },
    },
    events: {
      'wireguard-server-down': {
        probeInterval: '30s',
        alertFor: '5m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: {
              subscribers: [
                {
                  email: 'admin@default.net',
                  name: 'Admin',
                },
              ],
            },
          },
        ],
      },
      'wireguard-spoke-down': {
        probeInterval: '30s',
        alertFor: '2m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: {
              subscribers: [
                {
                  email: 'admin@default.net',
                  name: 'Admin',
                },
              ],
            },
          },
        ],
      },
      'public-ingress-down': {
        probeInterval: '5m',
        alertFor: '5m',
        notifications: [
          {
            'notification-provider-id': 'default-cluster-mailer-provider',
            payload: {
              subscribers: [
                {
                  email: 'admin@default.net',
                  name: 'Admin',
                },
              ],
            },
          },
        ],
      },
    },
  },
  users: [
    {
      user: 'root',
      password: '',
      groups: 'wheel',
      keyPath: './engine-private/deploy/id_rsa',
      pubKeyPath: './engine-private/deploy/id_rsa.pub',
      hosts: [
        {
          host: '00.000.00.000',
          port: 22,
        },
      ],
    },
  ],
}; /**/

export { DefaultConf };
