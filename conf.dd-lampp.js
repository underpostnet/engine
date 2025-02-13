import dotenv from 'dotenv';

dotenv.config();

const DefaultConf = /**/ {
  client: {},
  ssr: {},
  server: {
    'www.giancarlobertini.com': {
      '/': {
        client: 'html-website-templates-publicClientId-Horizontal Scroll One Page Template Website',
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'default' },
        proxy: [80, 443],
        mailer: {
          sender: { email: 'noreply@default.net', name: 'Default' },
          transport: {
            host: 'smtp.default.com',
            port: 465,
            secure: true,
            auth: { user: 'noreply@default.net', pass: '' },
          },
        },
      },
    },
    'giancarlobertini.com': {
      '/': {
        client: 'mysql_test',
        apis: [],
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        minifyBuild: false,
        liteBuild: true,
        docsBuild: false,
        proxy: [80, 443],
        redirect: 'https://www.giancarlobertini.com',
        db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'default' },
        mailer: {
          sender: { email: 'noreply@default.net', name: 'Default' },
          transport: {
            host: 'smtp.default.com',
            port: 465,
            secure: true,
            auth: { user: 'noreply@default.net', pass: '' },
          },
        },
      },
    },
    'www.ayleenbertini.com': {
      '/': {
        client: null,
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'default' },
        proxy: [80, 443],
        mailer: {
          sender: { email: 'noreply@default.net', name: 'Default' },
          transport: {
            host: 'smtp.default.com',
            port: 465,
            secure: true,
            auth: { user: 'noreply@default.net', pass: '' },
          },
        },
      },
    },
    'ayleenbertini.com': {
      '/': {
        client: 'mysql_test',
        apis: [],
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        minifyBuild: false,
        liteBuild: true,
        docsBuild: false,
        proxy: [80, 443],
        redirect: 'https://www.ayleenbertini.com',
        db: { provider: 'mongoose', host: 'mongodb://127.0.0.1:27017', name: 'default' },
        mailer: {
          sender: { email: 'noreply@default.net', name: 'Default' },
          transport: {
            host: 'smtp.default.com',
            port: 465,
            secure: true,
            auth: { user: 'noreply@default.net', pass: '' },
          },
        },
      },
    },
  },
  cron: {
    ipDaemon: { ip: null, minutesTimeInterval: 3, disabled: true },
    records: { A: [{ host: 'example.com', dns: 'dondominio', api_key: '???', user: '???' }] },
  },
}; /**/

export { DefaultConf };
