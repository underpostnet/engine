#! /usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../src/server/logger.js';
import { buildTemplate } from '../src/server/conf.js';

if (fs.existsSync('./engine-private/conf/dd-cron/.env.production'))
  dotenv.config({ path: `./engine-private/conf/dd-cron/.env.production`, override: true });
else dotenv.config();

const logger = loggerFactory(import.meta);

const program = new Command();

program
  .name('build.template')
  .description('Rebuild the standalone pwa-microservices-template from scratch out of the engine source tree.')
  .argument('[src-path]', 'Engine source root to sync from.', './')
  .argument('[to-path]', 'Template output path.', '../pwa-microservices-template')
  .action(async (srcPath, toPath) => {
    try {
      await buildTemplate({ srcPath: srcPath.replaceAll(`'`, ''), toPath: toPath.replaceAll(`'`, '') });
    } catch (error) {
      logger.error(error, error.stack);
      process.exit(1);
    }
  });

await program.parseAsync();
