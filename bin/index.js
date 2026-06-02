#! /usr/bin/env node

import { program } from '../src/cli/index.js';
import { loggerFactory } from '../src/server/logger.js';

const logger = loggerFactory(import.meta);

try {
  await program.parseAsync();
} catch (error) {
  logger.error(error);
  process.exit(1);
}
