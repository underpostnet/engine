import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { DefaultConf } from '../../../underpost.config.js';
import { PublicRoutes } from '../../../src/client/components/core/CommonJs.js';
import {
  PUBLIC_ROUTE_RENDERER_NAMES,
  publicRouteErrorsOf,
  publicRouteRenderersFactory,
} from '../../../src/server/network/public-route-renderers.js';

const owner = { host: 'site.test', path: '/', apis: ['document', 'user'], db: { name: 'site' } };

describe('public route declaration', () => {
  it('names only routes the client declares as public', () => {
    for (const name of PUBLIC_ROUTE_RENDERER_NAMES) expect(PublicRoutes[name], name).toBeDefined();
  });

  it('accepts no declaration, and the routes a host can serve', () => {
    expect(publicRouteErrorsOf({ ...owner })).toEqual([]);
    expect(publicRouteErrorsOf({ ...owner, publicRoutes: ['entry', 'objectLayer'] })).toEqual([]);
    expect(publicRouteErrorsOf({ host: 'site.test', path: '/', publicRoutes: ['objectLayer'] })).toEqual([]);
  });

  it('refuses an unknown route, a repeated route and a value that is not an array', () => {
    expect(publicRouteErrorsOf({ ...owner, publicRoutes: ['profile'] })[0]).toMatch(/unknown public route "profile"/);
    expect(publicRouteErrorsOf({ ...owner, publicRoutes: ['entry', 'entry'] })).toEqual([
      '"publicRoutes" repeats a route',
    ]);
    expect(publicRouteErrorsOf({ ...owner, publicRoutes: 'entry' })).toEqual(['"publicRoutes" is not an array']);
  });

  it('refuses an entry route on a host that does not own the document API', () => {
    for (const hostConf of [
      { ...owner, apis: ['user'] },
      { ...owner, db: undefined },
      { ...owner, apiBaseHost: 'api.site.test' },
    ])
      expect(publicRouteErrorsOf({ ...hostConf, publicRoutes: ['entry'] })[0]).toMatch(/public route "entry" needs/);
  });
});

describe('public route renderers', () => {
  it('loads nothing for a host that declares no route', async () => {
    expect(await publicRouteRenderersFactory({ ...owner })).toEqual({});
  });

  it('builds one renderer for each declared route', async () => {
    const renderers = await publicRouteRenderersFactory({ ...owner, publicRoutes: ['entry', 'objectLayer'] });
    expect(Object.keys(renderers)).toEqual(['entry', 'objectLayer']);
    for (const render of Object.values(renderers)) expect(render).toBeTypeOf('function');
  });

  it('names the host in the error of an invalid declaration', async () => {
    await expect(publicRouteRenderersFactory({ ...owner, publicRoutes: ['nope'] })).rejects.toThrow(
      /^site\.test\/: unknown public route/,
    );
  });
});

describe('public routes of the deploy confs', () => {
  const confs = [
    ['the default conf', DefaultConf.server],
    ...(fs.existsSync('./engine-private/conf')
      ? fs
          .readdirSync('./engine-private/conf')
          .filter((deployId) => fs.existsSync(`./engine-private/conf/${deployId}/conf.server.json`))
          .map((deployId) => [
            deployId,
            JSON.parse(fs.readFileSync(`./engine-private/conf/${deployId}/conf.server.json`, 'utf8')),
          ])
      : []),
  ];

  it.each(confs)('declares valid public routes in %s', (name, confServer) => {
    const errors = Object.entries(confServer).flatMap(([host, paths]) =>
      Object.entries(paths).flatMap(([path, hostConf]) =>
        publicRouteErrorsOf({ ...hostConf, host, path }).map((error) => `${host}${path}: ${error}`),
      ),
    );
    expect(errors).toEqual([]);
  });
});
