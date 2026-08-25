/**
 * Per-key access to the underpost root env store: a single host-scoped dotenv file next to the
 * global installation, holding this node's configuration values.
 *
 * Deliberately separate from the `host` domain rather than folded into it. `host` owns that
 * store's bulk lifecycle through the seven canonical domain actions; this module is key-level
 * CRUD on the same file, a different interaction shape with no place in that verb set.
 *
 * Container runtime status does not live here — see {@link UnderpostState}.
 * @module src/cli/env.js
 * @namespace UnderpostEnv
 */

import { dotenvStoreFactory } from './dotenv-store.js';
import { getUnderpostRootPath } from '../server/runtime/environment.js';

class UnderpostRootEnv {
  static API = dotenvStoreFactory({
    path: () => `${getUnderpostRootPath()}/.env`,
    label: 'underpost root',
  });
}

export default UnderpostRootEnv;
