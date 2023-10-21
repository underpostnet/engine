import { loggerFactory } from '../src/server/logger.js';
import colors from 'colors';

colors.enable();

const logger = loggerFactory(import.meta);

const data = {
  help: `
---------------------------------------------------------------
${`Help`.white}
---------------------------------------------------------------

Arguments:

> [optional] section: help | install | deploy
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

Command Line:

> ${`node bin/install <os> <program>`.yellow}
`,
  deploy: `
---------------------------------------------------------------
${`Deploy management`.white}
---------------------------------------------------------------

Arguments:

> [required] dev-hosts: localhost,localhost/path,...

Command Line:

> ${`node bin/deploy <dev-hosts>`.yellow}
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
