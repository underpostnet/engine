'use strict';

/**
 * @module sanitize-html-browser.test
 * @description Runs the client's user-content sanitizer (`sanitizeHtml` in
 * `src/client/components/core/VanillaJs.js`) in a real browser DOM: an author's HTML in a Markdown
 * body must never break the panel it renders into — an open `<style>` or `<script>` would swallow
 * the rest of the page — nor run script through elements, event handlers or scripted URLs, while
 * everything Markdown legitimately renders to survives intact.
 *
 * Needs the `puppeteer-core` driver, which is not a declared dependency
 * (`npm install --no-save puppeteer-core`), and a Firefox binary (`UNDERPOST_BROWSER_BIN`, or
 * `firefox` on PATH). Skipped otherwise.
 *
 * Uses 'chai' for assertions.
 */

import nodePath from 'path';
import express from 'express';
import { expect } from 'chai';
import { findBinary } from '../../support/binary.js';

const puppeteer = await import('puppeteer-core').then((module) => module.default).catch(() => null);
const browserBinary = findBinary('firefox', 'UNDERPOST_BROWSER_BIN');

const listen = (app) =>
  new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
const close = (server) =>
  new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

describe.skipIf(!puppeteer || !browserBinary)('user content sanitizer in the browser', () => {
  let server;
  let browser;
  let page;

  beforeAll(async () => {
    const app = express();
    app.use('/core', express.static(nodePath.resolve('src/client/components/core')));
    // The module is loaded by the page itself: the test runner rewrites a dynamic import inside an
    // evaluated function into its own loader, which the browser does not have.
    app.get('/', (req, res) =>
      res.type('html').send(`<!doctype html><html><body><div class="panel"></div><div class="after">after</div>
        <script type="module">
          import { sanitizeHtml } from '/core/VanillaJs.js';
          window.sanitizeHtml = sanitizeHtml;
        </script></body></html>`),
    );
    server = await listen(app);
    browser = await puppeteer.launch({ browser: 'firefox', executablePath: browserBinary, headless: true });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.sanitizeHtml === 'function', { timeout: 20000 });
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    if (server) await close(server);
  });

  const sanitize = (html) => page.evaluate((html) => window.sanitizeHtml(html), html);

  it('drops raw-text and scripting elements with their content, so an open one cannot swallow the page', async () => {
    expect(await sanitize('<p>a</p><style>html{}</style><p>b</p>')).to.equal('<p>a</p><p>b</p>');
    expect(await sanitize('<p>a</p><style>html{}<p>b</p>')).to.equal('<p>a</p>');
    expect(
      await sanitize(
        '<p>a</p><script type="application/ld+json">{"a":1}</script><meta name="x" content="y"><link rel="canonical" href="/x"></head><body><p>b</p>',
      ),
    ).to.equal('<p>a</p><p>b</p>');
    expect(
      await sanitize('<iframe src="https://evil"></iframe><textarea>t</textarea><svg onload="x()"><circle/></svg>x'),
    ).to.equal('x');
    const rendered = await page.evaluate(() => {
      document.querySelector('.panel').innerHTML = window.sanitizeHtml(
        '<p>post</p><style>\nhtml { }<pre><code>x</code></pre>',
      );
      return {
        panel: document.querySelector('.panel').textContent,
        after: document.querySelector('.after')?.textContent,
      };
    });
    expect(rendered).to.deep.equal({ panel: 'post', after: 'after' });
  });

  it('strips event handlers and scripted URLs, keeps safe links and images, and isolates new windows', async () => {
    expect(
      await sanitize(
        '<img src="javascript:alert(1)" onerror="alert(1)" alt="x"><a href="javascript:alert(2)" target="_blank">l</a>' +
          '<a href="https://ok.example/" target="_blank">ok</a><a href="/rel?x=1#h">rel</a><a href="java\tscript:alert(3)">tab</a>' +
          '<img src="data:image/png;base64,AAAA" alt="ok"><img src="data:text/html;base64,AAAA" alt="bad">',
      ),
    ).to.equal(
      '<img alt="x"><a target="_blank" rel="noopener noreferrer">l</a>' +
        '<a href="https://ok.example/" target="_blank" rel="noopener noreferrer">ok</a><a href="/rel?x=1#h">rel</a><a>tab</a>' +
        '<img src="data:image/png;base64,AAAA" alt="ok"><img alt="bad">',
    );
  });

  it('unwraps unknown elements, removes comments, and keeps what Markdown renders to', async () => {
    expect(
      await sanitize(
        '<b onclick="x()" style="color:red" id="modal-menu">bold</b><custom-el class="c">text</custom-el><!-- c -->' +
          '<form action="/x"><button>b</button>in form</form><input type="checkbox" checked disabled onchange="x()">',
      ),
    ).to.equal('<b style="color:red">bold</b>textbin form<input type="checkbox" checked="" disabled="">');
    expect(await sanitize('<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>')).to.equal(
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>',
    );
    expect(
      await sanitize(
        '<table><tr><td colspan="2">c</td></tr></table><blockquote><h2>t</h2><ul><li>i</li></ul></blockquote>',
      ),
    ).to.equal(
      '<table><tbody><tr><td colspan="2">c</td></tr></tbody></table><blockquote><h2>t</h2><ul><li>i</li></ul></blockquote>',
    );
    expect(await sanitize('')).to.equal('');
  });
});
