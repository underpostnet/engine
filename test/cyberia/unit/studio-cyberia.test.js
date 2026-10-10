import { afterAll, describe, expect, it, vi } from 'vitest';

const modal = vi.hoisted(() => ({ Data: {}, writeHTML: vi.fn() }));
const open = vi.hoisted(() => new Set());
vi.mock('../../../src/client/components/core/Modal.js', () => ({ Modal: modal }));
vi.mock('../../../src/client/components/core/Router.js', () => ({ getProxyPath: () => '/' }));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  s: (selector) => (open.has(selector) ? {} : null),
}));
vi.stubGlobal('html', (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), ''));
const { StudioCyberia } = await import('../../../src/client/components/cyberia/StudioCyberia.js');
afterAll(() => vi.unstubAllGlobals());

describe('the Studio views on a session change', () => {
  it('renders each open editor again, and no closed one', async () => {
    for (const route of ['cyberia-map-engine', 'object-layer-engine', 'cyberia-entity-engine'])
      modal.Data[`modal-${route}`] = { options: { html: async () => `${route} view` } };
    open.add('.modal-cyberia-map-engine').add('.modal-object-layer-engine');

    await StudioCyberia.reload();

    expect(modal.writeHTML.mock.calls.map(([call]) => call)).toEqual([
      { idModal: 'modal-object-layer-engine', html: 'object-layer-engine view' },
      { idModal: 'modal-cyberia-map-engine', html: 'cyberia-map-engine view' },
    ]);
  });
});
