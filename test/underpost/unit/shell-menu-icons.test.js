'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { shellEntries } from '../../support/shell-entries.js';

/**
 * A shell that declares an `iconSet` draws every visible drawer entry from that image set, and
 * `ShellNavigation` titles the view each entry opens with the `-modal` variant. A font icon on a
 * visible entry, or a view title of its own, breaks the set; a hidden entry may keep a font icon.
 */
const COMPONENTS = './src/client/components';

const imageSetShells = () => {
  const shells = [];
  for (const client of fs.readdirSync(COMPONENTS)) {
    for (const file of fs.readdirSync(`${COMPONENTS}/${client}`)) {
      if (!file.startsWith('AppShell')) continue;
      const source = fs.readFileSync(`${COMPONENTS}/${client}/${file}`, 'utf8');
      if (/iconSet: '[a-z0-9-]+'/.test(source)) shells.push({ client, entries: shellEntries(source) });
    }
  }
  return shells;
};

describe('shell menu icon set', () => {
  const shells = imageSetShells();

  it('finds the shells that draw their menu with an image set', () => {
    // A sliced tree carries only some of these clients, or none.
    const carried = ['cyberia-portal', 'itemledger', 'objectlayer'].filter((client) =>
      fs.existsSync(`${COMPONENTS}/${client}`),
    );
    expect(shells.map(({ client }) => client)).to.include.members(carried);
    for (const { client, entries } of shells) expect(entries.length, client).to.be.greaterThan(0);
  });

  it('draws every visible menu entry with the image set', () => {
    const fontIcons = [];
    for (const { client, entries } of shells)
      for (const { id, hidden, properties } of entries)
        if (!hidden && !properties.has('image')) fontIcons.push(`${client}: ${id}`);
    expect(fontIcons).to.deep.equal([]);
  });

  it('titles the view a visible entry opens with the modal image variant', () => {
    const ownTitles = [];
    for (const { client, entries } of shells)
      for (const { id, hidden, text } of entries)
        if (!hidden && /renderViewTitle\(/.test(text)) ownTitles.push(`${client}: ${id}`);
    expect(ownTitles).to.deep.equal([]);
  });
});
