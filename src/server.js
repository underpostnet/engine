'use strict';

import { buildClient } from './server/client-build.js';
import { buildRuntime } from './server/runtime.js';
import { buildProxy } from './server/proxy.js';

await buildClient();
await buildRuntime();
await buildProxy();
