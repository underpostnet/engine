'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { DOCS_ROOT, DOCS_VIEWS } from '../../../src/server/build/docs.js';
import { callText, shellEntries } from '../../support/shell-entries.js';

/**
 * The docs submenu is a contract split between core and each app shell: `Docs.instance` fills
 * `.menu-btn-container-children-docs`, and `ShellNavigation` renders that container, its caret and
 * its toggle for an entry the shell declares a `submenu`. A shell that offers the docs view has to
 * declare it so.
 */
const COMPONENTS = './src/client/components';

const appShells = () => {
  const shells = [];
  for (const client of fs.readdirSync(COMPONENTS)) {
    for (const file of fs.readdirSync(`${COMPONENTS}/${client}`)) {
      if (!file.startsWith('AppShell')) continue;
      const source = fs.readFileSync(`${COMPONENTS}/${client}/${file}`, 'utf8');
      shells.push({ client, source, docs: shellEntries(source).find(({ id }) => id === 'docs') });
    }
  }
  return shells;
};

// The docs view exists only in a tree that ships the docs tree.
describe.skipIf(!fs.existsSync(DOCS_ROOT))('docs submenu contract', () => {
  const shells = appShells();

  it('finds the app shells to check', () => {
    expect(shells.length).to.be.greaterThan(0);
    expect(shells.some(({ docs }) => docs)).to.equal(true);
  });

  it('declares the docs entry a submenu in every shell offering the docs view', () => {
    const missing = [];
    for (const { client, docs } of shells) {
      // A hidden entry offers nothing to open; core serves the landing page without a submenu.
      if (!docs || docs.hidden) continue;
      if (docs.properties.get('submenu') !== 'true') missing.push(`${client}: docs submenu`);
    }
    expect(missing).to.deep.equal([]);
  });

  it('opens the docs view from every shell that declares the submenu', () => {
    const missing = [];
    for (const { client, docs } of shells) {
      if (docs?.properties.get('submenu') !== 'true') continue;
      if (!docs.text.includes('Docs.instance(')) missing.push(`${client}: Docs.instance call`);
    }
    expect(missing).to.deep.equal([]);
  });

  it('leaves the drawer order and the submenu state to the shell navigation', () => {
    const owned = shells
      .filter(({ source }) => /new Sortable\(|subMenuRender\(|sortableSubMenuEvents\(/.test(source))
      .map(({ client }) => client);
    expect(owned).to.deep.equal([]);
  });

  // The guide lists the domains the build names for the application. An application with no
  // documentation view has no documentation of its own, so it deploys no guide entry.
  it('gives every shell that offers the guide a documentation view, and lands inside it', () => {
    const wrong = [];
    for (const { client, source } of shells) {
      const call = callText(source, 'Docs.instance');
      if (!call) continue;
      const view = DOCS_VIEWS[client];
      if (!view) {
        if (!/disabled: \[[^\]]*'guide'/.test(call))
          wrong.push(`${client}: has no documentation view and offers the guide`);
        continue;
      }
      if (/domain: '/.test(call)) wrong.push(`${client}: names a domain; the build names the view`);
      const landing = source.match(/MainBodyDocument\.instance\(\{ path: '([^/']+)\//)?.[1];
      if (landing && !view.includes(landing)) wrong.push(`${client}: lands on "${landing}" outside its view`);
    }
    expect(wrong).to.deep.equal([]);
  });
});
