'use strict';

/**
 * Runs a runtime entry for development and restarts it when a source changes.
 * Usage: `node src/dev <src/api|src/server> [args...]`.
 * @module src/dev.js
 */
import { loggerFactory } from './server/ops/logger.js';
import { exitOnSignals, watchRunnerFactory } from './server/runtime/watch-runner.js';

const logger = loggerFactory(import.meta);

const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error('Usage: node src/dev <src/api|src/server> [args...]');

// The combined server rebuilds the client at startup.
const watch = { directory: 'src', ignoredPaths: script === 'src/api' ? ['client'] : [] };
const runner = watchRunnerFactory({ script, args, ...watch });
logger.info('Development watcher', { script, args, ...watch });
runner.start();
exitOnSignals(runner);
