import { buildClient } from './server/client-build.js';
import { buildRuntime } from './server/runtime.js';

await buildClient();
await buildRuntime();
