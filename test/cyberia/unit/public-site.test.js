import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/projects/cyberia/runtime/game-origins.js', () => ({
  gameOrigins: (deployId, environment) => ({
    portal: environment === 'development' ? 'http://localhost:4004' : 'https://services.fixture.test',
  }),
}));
vi.mock('../../../src/projects/cyberia/content/content-artifact.js', () => ({ optionalContentArtifact: () => null }));

const { LISTED_STATUS, PUBLIC_SITE_CLIENT, listedWorlds, ssrData } =
  await import('../../../src/projects/cyberia/instance/public-worlds.js');
const { ssrFactory } = await import('../../../src/client-builder/ssr.js');

const services = 'https://services.fixture.test';

describe('public website worlds', () => {
  it('lists the published worlds only, in release order, through the launch bridge', () => {
    const worlds = listedWorlds(
      [
        { code: 'violet strata', name: 'The Violet Strata', description: 'A world.', status: LISTED_STATUS },
        { code: 'test', name: 'test', description: 'test', status: 'unlisted' },
        { code: 'archive', name: 'Archive', status: 'archived' },
        { code: 'bare', status: LISTED_STATUS },
      ],
      services,
    );
    expect(worlds).toEqual([
      {
        code: 'violet strata',
        name: 'The Violet Strata',
        description: 'A world.',
        href: `${services}/launch?world=violet%20strata`,
      },
      { code: 'bare', name: 'bare', description: '', href: `${services}/launch?world=bare` },
    ]);
  });

  it('gives SSR data to the public client only, on the services origin of the build mode', () => {
    expect(ssrData({ deployId: 'dd-cyberia', client: 'cyberia-portal', development: false })).toBeUndefined();
    const production = ssrData({ deployId: 'dd-cyberia', client: PUBLIC_SITE_CLIENT, development: false });
    expect(production).toEqual({
      services,
      links: {
        play: `${services}/launch`,
        worlds: `${services}/instance-selection`,
        logIn: `${services}/log-in`,
        signUp: `${services}/sign-up`,
        studio: `${services}/cyberia-studio`,
        docs: `${services}/docs`,
      },
      worlds: [],
    });
    expect(ssrData({ deployId: 'dd-cyberia', client: PUBLIC_SITE_CLIENT, development: true }).links.logIn).toBe(
      'http://localhost:4004/log-in',
    );
  });
});

describe('public landing page', () => {
  const render = async (worlds) =>
    (await ssrFactory('./src/client/ssr/body/CyberiaPublicLanding.js'))({
      title: 'CYBERIA Online',
      description: 'Free browser MMORPG.',
      author: 'https://github.com/underpostnet',
      ssrPath: '/',
      data: { ...ssrData({ deployId: 'dd-cyberia', client: PUBLIC_SITE_CLIENT, development: false }), worlds },
    });

  it('holds its content, navigation and entry points in the HTML, with no script', async () => {
    const html = await render(listedWorlds([{ code: 'a', name: 'Alpha & <Beta>', status: LISTED_STATUS }], services));
    expect(html).not.toMatch(/<script/i);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<nav aria-label="Main">');
    expect(html).toContain('<main id="main">');
    expect(html).toContain(`href="${services}/log-in"`);
    expect(html).toContain(`href="${services}/cyberia-studio"`);
    expect(html).toContain(`href="${services}/launch?world=a"`);
    expect(html).toContain('Alpha &amp; &lt;Beta&gt;');
    expect(html).not.toContain('<Beta>');
  });

  it('points to the world list when no world is published', async () => {
    const html = await render([]);
    expect(html).toContain('class="cp-empty"');
    expect(html).toContain(`href="${services}/instance-selection"`);
  });

  it('renders without project data, and leaves out the links it lacks', async () => {
    const landing = await ssrFactory('./src/client/ssr/body/CyberiaPublicLanding.js');
    const html = landing({ title: 't', description: 'd', ssrPath: '/' });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('/log-in');
    expect(html).toContain('class="cp-empty"');
  });
});
