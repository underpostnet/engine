'use strict';

/**
 * @module test/support/tree
 * @description Tells a suite whether it runs in the unsliced engine tree. `buildTemplate` drops
 * `build:template` from the manifest and every product manifest inherits that, so the script is
 * the one durable marker of the tree every sliced repository is built from.
 */

import fs from 'fs-extra';

const unslicedTree = !!fs.readJsonSync('./package.json').scripts?.['build:template'];

export { unslicedTree };
