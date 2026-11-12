/**
 * @module test/support/api-module
 * @description Starts an API module through the runtime contract (`src/server/domain/api-module.js`):
 * the context the runtime builds, the services the module declares, its start, then its router.
 * A suite replaces a service with `services`, or the token check of the auth service with
 * `authenticate`; the role checks after it stay the real ones.
 */

import { DataBaseProviderService } from '../../src/db/database-provider.js';
import { apiAssetService } from '../../src/server/domain/api-assets.js';
import { apiContextFactory, apiModuleDefects, startApiModule } from '../../src/server/domain/api-module.js';
import { authServiceFactory } from '../../src/server/security/auth.js';

/** A mailer that records each message and delivers none; `failing` makes each delivery fail. */
export const recordingMailer = () => {
  const mailer = {
    sent: [],
    failing: false,
    send: async (message) => {
      mailer.sent.push(message);
      return mailer.failing ? undefined : { messageId: `test-${mailer.sent.length}` };
    },
    template: (name) => `<p>{{H1}} {{P1}} {{TOKEN}} {{COMPANY}} {{RECOVER_WEB_URL}} {{RECOVER_BTN_LABEL}} ${name}</p>`,
    translation: () => ({ H1: { en: 'H1', es: 'H1' }, P1: { en: 'P1', es: 'P1' }, BTN_LABEL: { en: 'Go', es: 'Ir' } }),
  };
  return mailer;
};

/**
 * The context of a module for a test: each declared service, a replacement first.
 * @param {import('../../src/api/types.js').ApiModuleDefinition} definition
 * @param {Object} [params]
 * @param {string} [params.host='test.local']
 * @param {string} [params.path='/']
 * @param {Object<string,string>} [params.consumes]
 * @param {string[]} [params.origins]
 * @param {Object} [params.extension]
 * @param {import('express').RequestHandler} [params.authenticate] - Replaces the token check.
 * @param {Object} [params.services] - Replaces a declared service.
 * @returns {import('../../src/api/types.js').ApiRouterContext}
 */
export const testApiContext = (
  definition,
  { host = 'test.local', path = '/', consumes, origins, extension, authenticate, services = {} } = {},
) => {
  const defects = apiModuleDefects(definition.id, definition);
  if (defects.length) throw new Error(defects.join('; '));
  const identity = { host, path };
  const build = {
    database: () => DataBaseProviderService.getDispatcher(identity),
    auth: () => authServiceFactory(identity, authenticate),
    mailer: () => recordingMailer(),
    assets: () => apiAssetService(definition.id, definition.assets),
  };
  return apiContextFactory({
    host,
    path,
    consumes,
    origins,
    extension,
    services: Object.fromEntries(definition.services.map((name) => [name, services[name] ?? build[name]()])),
  });
};

/**
 * Starts a module for a test and answers its router.
 * @param {import('../../src/api/types.js').ApiModuleDefinition} definition
 * @param {Parameters<typeof testApiContext>[1]} [params]
 * @returns {Promise<{context: import('../../src/api/types.js').ApiRouterContext, router: import('express').Router}>}
 */
export const startTestApi = async (definition, params) => {
  const context = testApiContext(definition, params);
  await startApiModule(definition, context);
  return { context, router: definition.createRouter(context) };
};
