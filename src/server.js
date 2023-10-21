import { clientBuild } from './server/client-build.js';
import { buildRuntime } from './server/runtime.js';

await clientBuild();
await buildRuntime();
