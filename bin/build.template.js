#! /usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import { loggerFactory } from '../src/server/ops/logger.js';
import { buildTemplate, updatePrivateTemplateRepo } from '../src/server/runtime/conf.js';

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
  .option('--update-private', 'Update private template repository', false)
  .option('--no-clone', 'Fail instead of cloning when the template checkout is missing or foreign.')
  .action(async (srcPath, toPath, options) => {
    try {
      if (options.updatePrivate) return await updatePrivateTemplateRepo();
      await buildTemplate({
        srcPath: srcPath.replaceAll(`'`, ''),
        toPath: toPath.replaceAll(`'`, ''),
        noClone: options.clone === false,
      });
    } catch (error) {
      logger.error(error, error.stack);
      process.exit(1);
    }
  });

await program.parseAsync();
