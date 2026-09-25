'use strict';

/**
 * @module test/support/product-context
 * @description Tells a platform suite whether this checkout is the Cyberia product's context, so a
 * suite that loads Cyberia modules can `describe.skipIf(!cyberiaContext)` and import them only
 * where the Cyberia catalog packages are declared.
 */

import { loadProductContexts } from '../../src/server/build/catalog.js';

const cyberiaContext = (await loadProductContexts()).some(
  ({ deployId, active }) => deployId === 'dd-cyberia' && active,
);

export { cyberiaContext };
