const DefaultConf = /**/ {
  client: {},
  ssr: {},
  server: {
    'www.giancarlobertini.com': {
      '/': {
        client: null,
        runtime: 'wp',
        origins: [],
        repository: 'env:WP_REPOSITORY_GIANCARLOBERTINI',
        disabledRebuild: true,
        db: {
          provider: 'mariadb',
          host: 'env:MARIADB_HOST',
          name: 'env:DB_NAME_GIANCARLOBERTINI',
          user: 'env:MARIADB_USER',
          password: 'env:MARIADB_PASSWORD',
        },
        wp: {
          adminUser: 'env:WP_ADMIN_USER_GIANCARLOBERTINI',
          adminPassword: 'env:WP_ADMIN_PASSWORD_GIANCARLOBERTINI',
          adminEmail: 'env:WP_ADMIN_EMAIL_GIANCARLOBERTINI',
          wpMailSmtp: {
            fromEmail: 'env:WP_MAIL_SMTP_FROM_EMAIL_GIANCARLOBERTINI',
            fromName: 'env:WP_MAIL_SMTP_FROM_NAME_GIANCARLOBERTINI',
            mailer: 'smtp',
            returnPath: true,
            smtp: {
              host: 'env:WP_MAIL_SMTP_HOST',
              port: 'env:WP_MAIL_SMTP_PORT:int:465',
              encryption: 'tls',
              auth: true,
              user: 'env:WP_MAIL_SMTP_USER',
              pass: 'env:WP_MAIL_SMTP_PASS',
            },
          },
        },
        proxy: [80, 443],
      },
    },
    'giancarlobertini.com': {
      '/': {
        client: null,
        apis: [],
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        proxy: [80, 443],
        redirect: 'https://www.giancarlobertini.com',
      },
    },
    'www.ayleenbertini.com': {
      '/': {
        client: null,
        runtime: 'wp',
        origins: [],
        repository: 'env:WP_REPOSITORY_AYLEENBERTINI',
        disabledRebuild: true,
        db: {
          provider: 'mariadb',
          host: 'env:MARIADB_HOST',
          name: 'env:DB_NAME_AYLEENBERTINI',
          user: 'env:MARIADB_USER',
          password: 'env:MARIADB_PASSWORD',
        },
        wp: {
          adminUser: 'env:WP_ADMIN_USER_AYLEENBERTINI',
          adminPassword: 'env:WP_ADMIN_PASSWORD_AYLEENBERTINI',
          adminEmail: 'env:WP_ADMIN_EMAIL_AYLEENBERTINI',
          wpMailSmtp: {
            fromEmail: 'env:WP_MAIL_SMTP_FROM_EMAIL_AYLEENBERTINI',
            fromName: 'env:WP_MAIL_SMTP_FROM_NAME_AYLEENBERTINI',
            mailer: 'smtp',
            returnPath: true,
            smtp: {
              host: 'env:WP_MAIL_SMTP_HOST',
              port: 'env:WP_MAIL_SMTP_PORT:int:465',
              encryption: 'tls',
              auth: true,
              user: 'env:WP_MAIL_SMTP_USER',
              pass: 'env:WP_MAIL_SMTP_PASS',
            },
          },
        },
        proxy: [80, 443],
      },
    },
    'ayleenbertini.com': {
      '/': {
        client: null,
        apis: [],
        runtime: 'lampp',
        origins: [],
        disabledRebuild: true,
        proxy: [80, 443],
        redirect: 'https://www.ayleenbertini.com',
      },
    },
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
}; /**/

export { DefaultConf };
