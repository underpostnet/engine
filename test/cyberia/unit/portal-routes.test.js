import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { resolvePathRoutes } from '../../../src/server/network/path-routes.js';
import { CYBERIA_PUBLIC_HOST, CYBERIA_SERVICES_HOST } from '../../../src/projects/cyberia/stack/domain-ownership.js';

// The navigation contract of the portal: its router, its views, the documents the build makes of
// them, and the paths the public website routes to it. Read from the live deploy configuration.
const confDir = new URL('../../../engine-private/conf/dd-cyberia/', import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, confDir), 'utf8'));
const router = fs.readFileSync(
  new URL('../../../src/client/components/cyberia-portal/RouterCyberiaPortal.js', import.meta.url),
  'utf8',
);
const routes = [...router.matchAll(/^ {6}'(\/[^']*)': \{/gm)].map(([, path]) => path);

describe.skipIf(!fs.existsSync(new URL('conf.server.json', confDir)))('portal navigation contract', () => {
  const confServer = read('conf.server.json');
  const confClient = read('conf.client.json');
  const confSSR = read('conf.ssr.json');
  const views = confClient['cyberia-portal'].views;

  it('gives every router route a view, and every view a route', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect([...routes].sort()).toEqual(views.map((view) => view.path).sort());
  });

  it('builds every view as a portal document with its bundle', () => {
    expect(views.filter((view) => view.client !== 'CyberiaPortal' || view.ssr !== 'CyberiaPortal')).toEqual([]);
    expect(fs.existsSync(new URL('../../../src/client/CyberiaPortal.index.js', import.meta.url))).toBe(true);
  });

  it('opens each menu route through the menu button of the same name', () => {
    const buttons = [...router.matchAll(/^ {6}'\/([^']+)': \{[^}]*?\.main-btn-([\w-]+)`/gm)];
    expect(buttons.filter(([, path, button]) => path !== button).map(([, path]) => path)).toEqual([]);
  });

  it('redirects every portal document of the public website to the services host, except its own root', () => {
    const resolved = resolvePathRoutes({ confServer, confClient, confSSR, host: CYBERIA_PUBLIC_HOST, path: '/' });
    expect(resolved.every((route) => route.redirect && route.destination.host === CYBERIA_SERVICES_HOST)).toBe(true);
    const redirected = resolved.flatMap((route) => route.matches.map((match) => match.path));
    expect(views.map((view) => view.path).filter((path) => path !== '/' && !redirected.includes(path))).toEqual([]);
    expect(redirected).toEqual(expect.arrayContaining(['/launch', '/log-in', '/api-docs']));
    expect(redirected).not.toContain('/');
  });

  it('routes no API, socket or portal asset through the public website', () => {
    const resolved = resolvePathRoutes({ confServer, confClient, confSSR, host: CYBERIA_PUBLIC_HOST, path: '/' });
    expect(resolved.flatMap((route) => route.matches).filter((match) => match.service)).toEqual([]);
    expect(resolved.map((route) => route.kind).sort()).toEqual(['PathPrefix', 'client-views']);
  });

  it('keeps accounts, settings and Studio out of search', () => {
    const indexable = views.filter((view) => view.noindex !== true).map((view) => view.path);
    expect(indexable.sort()).toEqual(['/docs', '/object-layer']);
    // `/object-layer` is the shell of every Object Layer page; the namespace itself opens the item list.
    expect(views.filter((view) => view.noindex !== true && view.sitemap !== false).map((view) => view.path)).toEqual([
      '/docs',
    ]);
    const launch = confSSR.CyberiaPortal.views.find((view) => view.path === '/launch');
    expect(launch.headers['X-Robots-Tag']).toBe('noindex');
  });
});
