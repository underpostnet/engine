'use strict';

// Requires puppeteer-core and Firefox through UNDERPOST_BROWSER_BIN or PATH.

import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { retiringServiceWorker } from '../../../src/client-builder/build-manifest.js';
import { findBinary } from '../../support/binary.js';

const puppeteer = await import('puppeteer-core').then((module) => module.default).catch(() => null);
const browserBinary = findBinary('firefox', 'UNDERPOST_BROWSER_BIN');

/** A worker of the application the origin served before: it fills the caches of its prefix. */
const APPLICATION_WORKER = `
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all(
      ['engine-core-root-pages', 'engine-core-root-assets'].map((name) =>
        caches.open(name).then((cache) => cache.put('/cached', new Response('cached'))),
      ),
    ),
  );
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
`;

const PAGE = '<!doctype html><title>origin</title><p>origin</p>';

/** One origin: a page, and a worker the test switches between builds. */
const origin = (worker) => {
  const state = { worker, loads: 0 };
  const app = express();
  app.get('/sw.js', (req, res) =>
    res.type('application/javascript').set('Cache-Control', 'no-store').send(state.worker),
  );
  app.get('/', (req, res) => {
    state.loads++;
    res.type('html').set('Cache-Control', 'no-store').send(PAGE);
  });
  return { app, state };
};

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

/** The state of the page origin: its worker registrations, its controller and its caches. */
const inspect = (page) =>
  page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    controlled: !!navigator.serviceWorker.controller,
    caches: (await caches.keys()).sort(),
  }));

const register = (page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 50 && !(await caches.keys()).length; i++) await new Promise((r) => setTimeout(r, 100));
  });

/** What the browser does when it next checks the worker of a registration: fetch it and install it if it changed. */
const update = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) await registration.update().catch(() => {});
    for (let i = 0; i < 50 && (await navigator.serviceWorker.getRegistrations()).length; i++)
      await new Promise((r) => setTimeout(r, 100));
  });

describe.skipIf(!puppeteer || !browserBinary)('retiring a service worker of a static build', () => {
  let browser;
  let servers;
  let publicSite;
  let services;

  beforeAll(async () => {
    publicSite = origin(APPLICATION_WORKER);
    services = origin(APPLICATION_WORKER);
    servers = await Promise.all([listen(publicSite.app), listen(services.app)]);
    browser = await puppeteer.launch({ browser: 'firefox', executablePath: browserBinary, headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    for (const server of servers ?? []) server.close();
  });

  const url = (index) => `http://127.0.0.1:${servers[index].address().port}/`;

  it('removes the worker and the caches of its prefix, keeps other caches and other origins, and stays removed', async () => {
    const page = await browser.newPage();
    await page.goto(url(1));
    await register(page);
    const servicesBefore = await inspect(page);

    await page.goto(url(0));
    await register(page);
    await page.evaluate(() => caches.open('other-application').then((cache) => cache.put('/x', new Response('x'))));
    expect((await inspect(page)).registrations).toBe(1);

    publicSite.state.worker = retiringServiceWorker({ basePath: '/' });
    const loads = publicSite.state.loads;
    // The retiring worker reloads the page it took over: the reload ends the evaluation that updated it.
    await Promise.all([page.waitForNavigation(), update(page).catch(() => {})]);
    expect(publicSite.state.loads).toBe(loads + 1);
    expect(await inspect(page)).toEqual({ registrations: 0, controlled: false, caches: ['other-application'] });

    await page.reload();
    expect(await inspect(page)).toEqual({ registrations: 0, controlled: false, caches: ['other-application'] });
    await page.reload();
    expect((await inspect(page)).registrations).toBe(0);

    await page.goto(url(1));
    expect(await inspect(page)).toEqual(servicesBefore);
  });
});
