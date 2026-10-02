import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'fs-extra';
import os from 'os';
import nodePath from 'path';
import { staticFileHeaders } from '../../../../src/server/network/middlewares.js';
import { buildManifestFactory, writeBuildManifest } from '../../../../src/client-builder/build-manifest.js';
import { BUILD_MANIFEST_REL } from '../../../../src/client/components/core/BuildManifest.js';

/** The relation specification: a page of the underpost client, at the path of the relation URI. */
const RELATION_PATH = new URL(BUILD_MANIFEST_REL).pathname;
const SPECIFICATION = `./src/client/public/underpost${RELATION_PATH}`;

/** A raw GET: fetch adds `Cache-Control: no-cache` to a conditional request, which always reloads. */
const rawGet = (url, headers) =>
  new Promise((resolve, reject) =>
    http.get(url, { headers }, (res) => resolve(res.resume() && res)).on('error', reject),
  );

// The static tier every built client is served from, over a real loopback socket.
describe('the served build manifest', () => {
  let root;
  let server;
  let origin;
  const manifest = buildManifestFactory({ application: 'underpost' });
  const subPathManifest = buildManifestFactory({ application: 'test', basePath: '/test' });

  beforeAll(async () => {
    root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'build-manifest-static-'));
    writeBuildManifest(root, manifest);
    writeBuildManifest(`${root}/test`, subPathManifest);
    if (fs.existsSync(SPECIFICATION)) fs.copySync(SPECIFICATION, `${root}${RELATION_PATH}`);
    fs.outputFileSync(`${root}/assets/icon.png`, 'png');
    const app = express();
    app.use('/', express.static(root, { setHeaders: staticFileHeaders }));
    server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.removeSync(root);
  });

  it.each([
    ['/underpost.manifest', () => manifest, ''],
    ['/test/underpost.manifest', () => subPathManifest, '/test'],
  ])('answers %s as JSON, with the bytes the build wrote', async (path, expected, base) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = await response.text();
    expect(body).toBe(fs.readFileSync(`${root}${base}/underpost.manifest`, 'utf8'));
    expect(JSON.parse(body)).toEqual(expected());
  });

  it('revalidates the stable URL on every use instead of caching it for good', async () => {
    const response = await fetch(`${origin}/underpost.manifest`);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    const etag = response.headers.get('etag');
    expect(etag).toBeTruthy();
    expect((await rawGet(`${origin}/underpost.manifest`, { 'If-None-Match': etag })).statusCode).toBe(304);
  });

  // A sliced tree ships no underpost client.
  it.skipIf(!fs.existsSync(SPECIFICATION))('answers the relation URI path with the specification as HTML', async () => {
    const response = await fetch(`${origin}${RELATION_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/html/);
    expect(await response.text()).toContain(`<link rel="canonical" href="${BUILD_MANIFEST_REL}" />`);
  });

  it('keeps every asset readable cross-origin', async () => {
    const response = await fetch(`${origin}/assets/icon.png`);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });
});
