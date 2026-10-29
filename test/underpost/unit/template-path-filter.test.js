import { describe, expect, it, vi } from 'vitest';

// A fixture default conf, so the filter runs the same in the engine tree and in a product build,
// which ships a default conf of its own.
vi.mock('../../../underpost.config.js', () => ({
  DefaultConf: {
    server: { 'default.net': { '/': { apis: ['user'] } } },
    client: { default: { services: ['user'], components: { core: ['Docs'] } } },
    ssr: {
      Default: {
        head: ['Seo'],
        body: ['CacheControl'],
        mailer: { userVerifyEmail: 'DefaultVerifyEmail' },
        views: [{ client: 'Default' }],
      },
    },
  },
}));

const { CONF_MANIFEST_BASENAME, validateTemplatePath } = await import('../../../src/server/runtime/conf.js');

describe('template path filter of the default conf', () => {
  it.each([
    ['.//src/api/user/user.service.js', true],
    ['.//src/api/types.js', true],
    ['.//src/api/shop/shop.service.js', false],
    [`.//${CONF_MANIFEST_BASENAME}.js`, true],
    [`.//${CONF_MANIFEST_BASENAME}.dd-core.js`, false],
    ['.//src/client/services/user/user.service.js', true],
    ['.//src/client/services/shop/shop.service.js', false],
    ['.//src/client/public/user/index.html', true],
    ['.//src/client/public/shop/index.html', false],
    ['.//src/client/components/core/Docs.js', true],
    ['.//src/client/components/shop/Cart.js', false],
    ['.//src/client/sw/core.sw.js', true],
    ['.//src/client/sw/shop.sw.js', false],
    ['.//src/client/ssr/body/CacheControl.js', true],
    ['.//src/client/ssr/body/Shop.js', false],
    ['.//src/client/ssr/head/Seo.js', true],
    ['.//src/client/ssr/head/Shop.js', false],
    ['.//src/client/ssr/mailer/DefaultVerifyEmail.js', true],
    ['.//src/client/ssr/mailer/ShopEmail.js', false],
    ['.//src/client/ssr/views/Default.js', true],
    ['.//src/client/ssr/views/Shop.js', false],
    ['.//hardhat/contracts/Token.sol', false],
    ['.//src/client/User.index.js', true],
    ['.//src/client/Shop.index.js', false],
    ['.//src/client/offline/Shop.index.js', true],
    ['.//src/ws/user/user.ws.js', true],
    ['.//src/ws/shop/shop.ws.js', false],
    ['.//src/server.js', true],
  ])('%s is carried: %s', (path, carried) => {
    expect(validateTemplatePath(path)).toBe(carried);
  });

  it('carries a path it is not given', () => {
    expect(validateTemplatePath()).toBe(true);
  });
});
