import { loggerFactory } from '../src/server/logger.js';
import colors from 'colors';

colors.enable();

const logger = loggerFactory(import.meta);

// backup: `node bin/db <host><path> export <deploy-id>`
// restore: `node bin/db <host><path> import <deploy-id>`
// new-api-src: `node bin/deploy build-nodejs-src-api <api-id>`
// text-to-image: `node bin/util text-to-image 's4()' white black 100x100`
// sync-packages: `node bin/deploy update-package`
// ssl: `npm run ssl <os> <deploy-id> <host>`
// clean empty folder: `node bin/util delete-empty-folder`
// sync env port: `node bin/deploy sync-env-port <deployId>`
// node bin/vs import
// node bin/vs export
// build macro replica: `node bin/deploy build-macro-replica dd`
// node bin/deploy update-version 2.5.2

const data = {
  help: `
---------------------------------------------------------------
${`Help`.white}
---------------------------------------------------------------

Arguments:

> [optional] section: help | install | ssl
> [optional] sections: section,section,...

Command Line:

> ${`node bin/help <section/s>`.yellow}
`,
  install: `
---------------------------------------------------------------
${`Programs installer`.white}
---------------------------------------------------------------

Arguments:

> [required] os: windows
> [required] program: certbot | xampp | docker | wordpress
> [required] host/path: example.com | example.com/path | www.example.com

Command Line:

> ${`node bin/install <os> <program> <host/path>`.yellow}
`,
  ssl: `
---------------------------------------------------------------
${`SSL management`.white}
---------------------------------------------------------------

Arguments:

> [required] os: windows
> [required] hosts: example.com,www.example.com

Command Line:

> ${`node bin/ssl <os> <hosts>`.yellow}
`,
  mariadb: `
---------------------------------------------------------------
${`DataBase management`.white}
---------------------------------------------------------------

Arguments:

> [required] operator: show | create | delete | import | export
> [required] host/path: example.com | example.com/path | www.example.com

Command Line:

> ${`node bin/db <host/path> <operator>`.yellow}
`,
  shortcut: `
---------------------------------------------------------------
${`Shortcut Generator`.white}
---------------------------------------------------------------

Arguments:

> [required] os: windows | linux
> [required] env: development | production | test

Command Line:

> ${`node bin/shortcut <os> <env>`.yellow}
`,
  end: '---------------------------------------------------------------',
};

logger.info('argv', process.argv);

const [exe, dir, sections] = process.argv;

try {
  let out = '';
  if (!sections) Object.keys(data).map((section) => (out += data[section]));
  else {
    for (const section of sections.split(',')) out += data[section];
    out += data['end'];
  }
  logger.info(out);
} catch (error) {
  logger.error(error, error.stack);
}
