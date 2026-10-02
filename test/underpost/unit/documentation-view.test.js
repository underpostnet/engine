import { describe, expect, it, vi } from 'vitest';

// The browser modules the view imports; only its domain selection is under test.
vi.mock('../../../src/client/components/core/Markdown.js', () => ({}));
vi.mock('../../../src/client/components/core/Logger.js', () => ({ loggerFactory: () => ({ error() {} }) }));
vi.mock('../../../src/client/components/core/Router.js', () => ({ getProxyPath: () => '/' }));
vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({}));

const { Documentation } = await import('../../../src/client/components/core/Documentation.js');

const published = { domains: [{ id: 'ecosystem' }, { id: 'object-layer' }, { id: 'underpost' }] };

describe('the documentation view', () => {
  it('navigates the domains the build names for its application, in published order', () => {
    const domains = Documentation.domains({ ...published, view: ['underpost', 'ecosystem'] });
    expect(domains.map(({ id }) => id)).toEqual(['ecosystem', 'underpost']);
  });

  it('navigates every published domain when the build names none', () => {
    expect(Documentation.domains({ ...published, view: [] })).toBe(published.domains);
  });

  it('fails on a navigation published before the build named views', () => {
    expect(() => Documentation.domains(published)).toThrow('names no view: build the docs again');
  });

  it('fails on a domain the instance does not publish', () => {
    expect(() => Documentation.domains({ ...published, view: ['cyberia'] })).toThrow(
      'the instance publishes no domain "cyberia"',
    );
  });
});
