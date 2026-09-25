'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';

/**
 * A shell that draws its menu with the `<client>-menu-icon` image set draws every visible entry
 * with it, and titles the view each entry opens with the `-modal` variant. A font icon on one
 * entry breaks the set; a hidden entry may keep one, as nothing draws it.
 */
const COMPONENTS = './src/client/components';
const MENU_ENTRY = /class: '([^']*\bmain-btn-menu\b[^']*)',[\s\S]*?icon: html`(<[a-z]+)[^`]*`/g;
const VIEW_HANDLER =
  /EventsUI\.onClick\(`\.main-btn-([a-z0-9-]+)`[\s\S]*?title: renderViewTitle\(\{\s*icon: html`\s*(<[a-z]+)[^`]*`/g;

const imageMenuShells = () => {
  const shells = [];
  for (const client of fs.readdirSync(COMPONENTS)) {
    for (const file of fs.readdirSync(`${COMPONENTS}/${client}`)) {
      if (!file.startsWith('AppShell')) continue;
      const source = fs.readFileSync(`${COMPONENTS}/${client}/${file}`, 'utf8');
      // The set is named after the public assets the shell draws from, not after the client.
      if (/class="inl [a-z0-9-]+-menu-icon"/.test(source)) shells.push({ client, source });
    }
  }
  return shells;
};

const routeOf = (classList) =>
  classList
    .split(/\s+/)
    .map((name) => name.match(/^main-btn-(?!menu\b)(?!menu-active\b)(.+)$/)?.[1])
    .find(Boolean);

describe('shell menu icon set', () => {
  const shells = imageMenuShells();

  it('finds the shells that draw their menu with an image set', () => {
    // A sliced tree carries only some of these clients, or none.
    const carried = ['cyberia-portal', 'itemledger', 'objectlayer'].filter((client) =>
      fs.existsSync(`${COMPONENTS}/${client}`),
    );
    expect(shells.map(({ client }) => client)).to.include.members(carried);
  });

  it('draws every visible menu entry with the image set', () => {
    const fontIcons = [];
    for (const { client, source } of shells) {
      for (const [, classList, tag] of source.matchAll(MENU_ENTRY)) {
        if (classList.split(/\s+/).includes('hide')) continue;
        if (tag !== '<img') fontIcons.push(`${client}: ${routeOf(classList)}`);
      }
    }
    expect(fontIcons).to.deep.equal([]);
  });

  it('titles the view a visible entry opens with the modal image variant', () => {
    const fontIcons = [];
    for (const { client, source } of shells) {
      const visible = new Set();
      for (const [, classList] of source.matchAll(MENU_ENTRY))
        if (!classList.split(/\s+/).includes('hide')) visible.add(routeOf(classList));
      for (const [, route, tag] of source.matchAll(VIEW_HANDLER))
        if (visible.has(route) && tag !== '<img') fontIcons.push(`${client}: ${route}`);
    }
    expect(fontIcons).to.deep.equal([]);
  });
});
