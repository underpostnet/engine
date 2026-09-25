'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { DOCS_ROOT, docsDocumentsFactory } from '../../../src/server/build/docs.js';

/**
 * The docs submenu is a contract split between core and each app shell: `Docs.instance` fills
 * `.menu-btn-container-children-docs`, and `subMenuRender('docs')` animates it against the
 * `.down-arrow-submenu-docs` caret. A shell that offers the docs view has to render both.
 */
const COMPONENTS = './src/client/components';
const DOCS_BUTTON = /class: '([^']*\bmain-btn-docs\b[^']*)'/;

const appShells = () => {
  const shells = [];
  for (const client of fs.readdirSync(COMPONENTS)) {
    for (const file of fs.readdirSync(`${COMPONENTS}/${client}`)) {
      if (!file.startsWith('AppShell')) continue;
      shells.push({
        client,
        path: `${COMPONENTS}/${client}/${file}`,
        source: fs.readFileSync(`${COMPONENTS}/${client}/${file}`, 'utf8'),
      });
    }
  }
  return shells;
};

describe('docs submenu contract', () => {
  const shells = appShells();

  it('finds the app shells to check', () => {
    expect(shells.length).to.be.greaterThan(0);
    expect(shells.some(({ source }) => DOCS_BUTTON.test(source))).to.equal(true);
  });

  it('renders the submenu container and caret in every shell offering the docs view', () => {
    const missing = [];
    for (const { client, source } of shells) {
      const button = source.match(DOCS_BUTTON);
      // A hidden entry offers nothing to open; core serves the landing page without a submenu.
      if (!button || button[1].split(/\s+/).includes('hide')) continue;
      if (!source.includes('menu-btn-container-children-docs')) missing.push(`${client}: submenu container`);
      if (!source.includes('down-arrow-submenu-docs')) missing.push(`${client}: submenu caret`);
      if (!source.includes(`subMenuRender('docs')`)) missing.push(`${client}: subMenuRender call`);
    }
    expect(missing).to.deep.equal([]);
  });

  it('opens the docs view from every shell that renders the submenu container', () => {
    const missing = [];
    for (const { client, source } of shells) {
      if (!source.includes('menu-btn-container-children-docs')) continue;
      if (!source.includes('Docs.instance(')) missing.push(`${client}: Docs.instance call`);
    }
    expect(missing).to.deep.equal([]);
  });

  it('keeps the submenu panel out of sorting and restores its open state after a drop', () => {
    const missing = [];
    for (const { client, source } of shells) {
      if (!source.includes('menu-btn-container-children-docs')) continue;
      if (!source.includes("draggable: '.main-btn-menu'")) missing.push(`${client}: sortable button selector`);
      if (!source.includes("sortableSubMenuEvents(['docs'])")) missing.push(`${client}: submenu sort state`);
      if (!source.includes('onStart: sortableSubMenus.onStart')) missing.push(`${client}: drag start handler`);
      if (!source.includes('sortableSubMenus.onEnd();')) missing.push(`${client}: drop handler`);
    }
    expect(missing).to.deep.equal([]);
  });

  // The guide view lists one domain: the one the shell owns. A shell that names no domain has no
  // documentation of its own, so it deploys no guide entry.
  it('names a published domain in every shell that offers the guide', () => {
    const published = new Set(docsDocumentsFactory({ references: [DOCS_ROOT] }).map((document) => document.domain));
    const wrong = [];
    for (const { client, source } of shells) {
      const call = source.match(/Docs\.instance\(\{[\s\S]*?\n\s*\}\)/)?.[0];
      if (!call) continue;
      const domain = call.match(/domain: '([^']+)'/)?.[1];
      if (!domain) {
        if (!/disabled: \[[^\]]*'guide'/.test(call)) wrong.push(`${client}: names no domain and offers the guide`);
        continue;
      }
      if (!published.has(domain)) wrong.push(`${client}: names unpublished domain "${domain}"`);
      const landing = source.match(/MainBodyDocument\.instance\(\{ domain: '([^']+)' \}\)/)?.[1];
      if (landing && landing !== domain) wrong.push(`${client}: lands on "${landing}" and guides "${domain}"`);
    }
    expect(wrong).to.deep.equal([]);
  });
});
