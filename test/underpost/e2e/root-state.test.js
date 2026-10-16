'use strict';

// Requires puppeteer-core and Firefox through UNDERPOST_BROWSER_BIN or PATH.

import fs from 'fs-extra';
import nodePath from 'path';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { srcFormatted } from '../../../src/client-builder/client-formatted.js';
import { ssrFactory } from '../../../src/client-builder/ssr.js';
import { findBinary } from '../../support/binary.js';

const puppeteer = await import('puppeteer-core').then((module) => module.default).catch(() => null);
const browserBinary = findBinary('firefox', 'UNDERPOST_BROWSER_BIN');

const CORE = nodePath.resolve('src/client/components/core');

// The modules `Css.js` imports that the theme controller does not exercise.
const STUBS = {
  'CssCore.js': 'export const CssCoreDark = { render: async () => "" }; export const CssCoreLight = CssCoreDark;',
  'DropDown.js': 'export const DropDown = {};',
  'Modal.js': 'export const Modal = { Data: {} };',
  'Router.js': 'export const getProxyPath = () => "/";',
  'Translate.js': 'export const Translate = {};',
};
const IMPORT_MAP = `<script type="importmap">${JSON.stringify({
  imports: Object.fromEntries(Object.keys(STUBS).map((name) => [`/core/${name}`, `/stub/${name}`])),
})}</script>`;

const SESSION_FIXTURE = `<style>
    .component-flex {
      display: flex;
    }
  </style>
  <div data-probe id="in-log-in" class="in session-in-log-in"></div>
  <div data-probe id="in-log-out" class="in session-in-log-out"></div>
  <div data-probe id="inl-log-in" class="inl session-inl-log-in"></div>
  <div data-probe id="inl-log-out" class="inl session-inl-log-out"></div>
  <div data-probe id="fl-log-in" class="fl session-fl-log-in"></div>
  <div data-probe id="fl-log-out" class="fl session-fl-log-out"></div>
  <div data-probe id="primitive-conflict" class="inl session-in-log-out"></div>
  <div data-probe id="component-conflict" class="component-flex session-fl-log-in"></div>
  <div data-probe id="hidden" class="in hide session-in-log-in"></div>`;

const THEME_SCRIPT = `<script type="module">
    import { Css, Themes } from '/core/Css.js';
    import { append } from '/core/VanillaJs.js';
    window.appendProbe = append;
    const theme = (name, dark, color) => ({
      theme: name,
      dark,
      render: async () => '<style>.themed { color: ' + color + '; }</style><div class="theme-noise"></div>',
    });
    window.themeProbe = {
      Themes,
      ready: Css.loadThemes([theme('probe-dark', true, 'rgb(1, 2, 3)'), theme('probe-light', false, 'rgb(4, 5, 6)')]),
    };
  </script>`;

const LOG_OUT = {
  'in-log-in': 'none',
  'in-log-out': 'block',
  'inl-log-in': 'none',
  'inl-log-out': 'inline-table',
  'fl-log-in': 'none',
  'fl-log-out': 'flow-root',
  'primitive-conflict': 'block',
  'component-conflict': 'none',
  hidden: 'none',
};
const LOG_IN = {
  'in-log-in': 'block',
  'in-log-out': 'none',
  'inl-log-in': 'inline-table',
  'inl-log-out': 'none',
  'fl-log-in': 'flow-root',
  'fl-log-out': 'none',
  'primitive-conflict': 'none',
  'component-conflict': 'flow-root',
  hidden: 'none',
};

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
const close = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

describe.skipIf(!puppeteer || !browserBinary)('root document state in the browser', () => {
  let server;
  let browser;
  let page;
  let origin;

  const open = async (path) => {
    await page.goto(`${origin}${path}`, { waitUntil: 'load' });
  };
  const openWithoutStoredTheme = async (path) => {
    await open(path);
    await page.evaluate(() => localStorage.removeItem('_theme'));
    await open(path);
  };
  const displays = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-probe]')].map((el) => [el.id, getComputedStyle(el).display]),
      ),
    );
  const setSession = (value) =>
    page.evaluate((session) => {
      if (session === null) delete document.documentElement.dataset.session;
      else document.documentElement.dataset.session = session;
    }, value);
  const themeState = () =>
    page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      sheets: [...document.querySelectorAll('.theme-style')].map((style) => style.parentElement.tagName),
      afterRootSheet: document
        .querySelector('.theme-style')
        .previousElementSibling.textContent.includes('.session-in-log-in'),
      color: getComputedStyle(document.querySelector('.themed')).color,
      noise: document.querySelectorAll('.theme-noise').length,
    }));

  beforeAll(async () => {
    const RootDocument = await ssrFactory();
    const splash = (await ssrFactory('./src/client/ssr/body/DefaultSplashScreen.js'))({});
    const rootDocument = (ssrHeadComponents, ssrBodyComponents) =>
      RootDocument({ title: 'Root state', ssrPath: '/', ssrHeadComponents, ssrBodyComponents, buildManifestHead: '' });
    const app = express();
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup({ openapi: '3.0.0', info: { title: 'Fixture', version: '1' }, paths: {} }),
    );
    app.get('/stub/:name', (req, res) => res.type('js').send(STUBS[req.params.name]));
    app.get('/core/:name', (req, res) =>
      res
        .type('js')
        .send(srcFormatted(fs.readFileSync(nodePath.join(CORE, nodePath.basename(req.params.name)), 'utf8'))),
    );
    app.get('/splash', (req, res) => res.type('html').send(rootDocument('', splash)));
    app.get('/', (req, res) =>
      res.type('html').send(rootDocument(IMPORT_MAP, `${SESSION_FIXTURE}<div class="themed"></div>${THEME_SCRIPT}`)),
    );
    server = await listen(app);
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ browser: 'firefox', executablePath: browserBinary, headless: true });
    page = await browser.newPage();
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    if (server) await close(server);
  });

  it('shows the log-out UI as rendered, before any client code changes the state', async () => {
    await open('/');
    expect(await page.evaluate(() => document.documentElement.dataset.session)).toBe('log-out');
    expect(await displays()).toEqual(LOG_OUT);
  });

  it('shows the log-in UI only while data-session is log-in', async () => {
    await open('/');
    await setSession('log-in');
    expect(await displays()).toEqual(LOG_IN);
    await setSession('log-out');
    expect(await displays()).toEqual(LOG_OUT);
    await setSession('unknown');
    expect(await displays()).toEqual(LOG_OUT);
    await setSession(null);
    expect(await displays()).toEqual(LOG_OUT);
  });

  it('uses the native Swagger dark and light controls', async () => {
    await open('/api-docs/');
    await page.waitForSelector('.dark-mode-toggle button');
    const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
    const systemDark = await page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    expect(await dark()).toBe(systemDark);
    await page.click('.dark-mode-toggle button');
    expect(await dark()).toBe(!systemDark);
    await page.click('.dark-mode-toggle button');
    expect(await dark()).toBe(systemDark);
    expect(await page.$('#swagger-theme-toggle')).toBeNull();
  });

  it('paints the splash in the stored theme through data-theme', async () => {
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await openWithoutStoredTheme('/splash');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    expect(await background()).toBe('rgb(25, 25, 25)');
    await page.evaluate(() => localStorage.setItem('_theme', 'core-light'));
    await open('/splash');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    expect(await background()).toBe('rgb(232, 232, 232)');
    await page.evaluate(() => localStorage.removeItem('_theme'));
  });

  it('keeps one theme sheet after the root sheet and data-theme in step with the live theme', async () => {
    await openWithoutStoredTheme('/');
    await page.evaluate(() => window.themeProbe.ready);
    expect(await themeState()).toEqual({
      theme: 'dark',
      sheets: ['HEAD'],
      afterRootSheet: true,
      color: 'rgb(1, 2, 3)',
      noise: 0,
    });
    const sameSheet = await page.evaluate(async () => {
      const sheet = document.querySelector('.theme-style');
      await window.themeProbe.Themes['probe-light']();
      return document.querySelector('.theme-style') === sheet && !sheet.textContent.includes('rgb(1, 2, 3)');
    });
    expect(sameSheet).toBe(true);
    expect(await themeState()).toEqual({
      theme: 'light',
      sheets: ['HEAD'],
      afterRootSheet: true,
      color: 'rgb(4, 5, 6)',
      noise: 0,
    });
    await page.evaluate(() => localStorage.removeItem('_theme'));
  });

  it('lets the root and theme sheets outrank a component stylesheet added through append', async () => {
    await openWithoutStoredTheme('/');
    await page.evaluate(() => window.themeProbe.ready);
    const computed = await page.evaluate(() => {
      window.appendProbe(
        'head',
        '<style>.late-head { position: relative; display: inline-block; color: rgb(9, 9, 9); }</style>',
      );
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div class="fix late-head"></div><i class="inl late-head"></i><div class="themed late-head"></div>',
      );
      const [fix, inl, themed] = document.querySelectorAll('body > .late-head');
      return {
        fix: getComputedStyle(fix).position,
        inl: getComputedStyle(inl).display,
        themed: getComputedStyle(themed).color,
      };
    });
    expect(computed).toEqual({ fix: 'fixed', inl: 'inline-table', themed: 'rgb(1, 2, 3)' });
  });
});
