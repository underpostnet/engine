'use strict';

import { expect } from 'chai';

vi.mock('../../../src/client/components/core/Logger.js', () => ({
  loggerFactory: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../src/client/components/core/Modal.js', () => ({
  Modal: { Data: {} },
  subMenuHandler: vi.fn(),
}));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({ s: vi.fn() }));
vi.mock('../../../src/client/components/core/Worker.js', () => ({ Worker: { title: 'Test' } }));

globalThis.window = { location: { pathname: '/', search: '', hash: '' } };
globalThis.location = globalThis.window.location;

const { isCurrentRoute, registerRoutes } = await import('../../../src/client/components/core/Router.js');

describe('current route ownership', () => {
  it('matches one manager route with or without a trailing slash', () => {
    registerRoutes(() => ({ '/object-layer-engine-viewer': {}, '/cyberia-map-engine': {} }));
    window.location.pathname = '/object-layer-engine-viewer/';

    expect(isCurrentRoute('object-layer-engine-viewer')).to.equal(true);
    expect(isCurrentRoute('cyberia-map-engine')).to.equal(false);
  });

  it('matches a manager route below a proxy path', () => {
    registerRoutes(() => ({ '/object-layer-engine-viewer': {} }));
    window.location.pathname = '/portal/object-layer-engine-viewer';

    expect(isCurrentRoute('object-layer-engine-viewer')).to.equal(true);
  });
});
