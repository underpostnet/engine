'use strict';

/**
 * Reads what an app shell declares for `ShellNavigation` from its source: the drawer entries,
 * their top-level properties, and the arguments of a call.
 *
 * @module test/support/shell-entries.js
 */

const CLOSE = { '(': ')', '[': ']', '{': '}' };

/** Index of the last character of the string or template that opens at `start`. */
const stringEnd = (source, start) => {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (quote === '`' && source[i] === '$' && source[i + 1] === '{') i = groupEnd(source, i + 1);
    else if (source[i] === quote) return i;
  }
  throw new Error(`Unterminated string at ${start}`);
};

/** Index of the character that ends the comment at `start`, or `start - 1` when none opens there. */
const commentEnd = (source, start) => {
  if (source[start] !== '/') return start - 1;
  if (source[start + 1] === '/') return source.indexOf('\n', start);
  if (source[start + 1] === '*') return source.indexOf('*/', start) + 1;
  return start - 1;
};

/** Index of the bracket that closes the group opening at `start`. */
const groupEnd = (source, start) => {
  const closing = [CLOSE[source[start]]];
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') i = stringEnd(source, i);
    else if (commentEnd(source, i) >= i) i = commentEnd(source, i);
    else if (CLOSE[c]) closing.push(CLOSE[c]);
    else if (c === closing[closing.length - 1]) {
      closing.pop();
      if (!closing.length) return i;
    }
  }
  throw new Error(`Unbalanced group at ${start}`);
};

/**
 * Walks the top level of the group opening at `start`, calling `visit(index)` on each character
 * outside strings, comments and nested groups; a nested group is visited by its opening bracket.
 */
const walkTopLevel = (source, start, visit) => {
  const end = groupEnd(source, start);
  for (let i = start + 1; i < end; i++) {
    const c = source[i];
    visit(i);
    if (c === "'" || c === '"' || c === '`') i = stringEnd(source, i);
    else if (commentEnd(source, i) >= i) i = commentEnd(source, i);
    else if (CLOSE[c]) i = groupEnd(source, i);
  }
};

/**
 * The top-level properties of the object literal opening at `start`, as raw source values.
 * @returns {Map<string, string>}
 */
const objectProperties = (source, start) => {
  const properties = new Map();
  const separators = [];
  walkTopLevel(source, start, (i) => source[i] === ',' && separators.push(i));
  const bounds = [start, ...separators, groupEnd(source, start)];
  for (let n = 0; n < bounds.length - 1; n++) {
    const text = source.slice(bounds[n] + 1, bounds[n + 1]).replace(/^(\s|\/\/[^\n]*\n)*/, '');
    const match = text.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*?)\s*$/);
    if (match) properties.set(match[1], match[2]);
  }
  return properties;
};

/**
 * The object entries of the `entries: [...]` array of a shell; entries built by a call are left out.
 * @returns {Array<{id: string, hidden: boolean, properties: Map<string, string>, text: string}>}
 */
const shellEntries = (source) => {
  const key = source.indexOf('entries: [');
  if (key < 0) return [];
  const list = source.indexOf('[', key);
  const entries = [];
  walkTopLevel(source, list, (i) => {
    if (source[i] !== '{') return;
    const properties = objectProperties(source, i);
    entries.push({
      id: properties.get('id')?.replace(/^'|'$/g, ''),
      hidden: properties.get('hidden') === 'true',
      properties,
      text: source.slice(i, groupEnd(source, i) + 1),
    });
  });
  return entries;
};

/** The source of the first call to `callee`, from its name to its closing parenthesis. */
const callText = (source, callee) => {
  const start = source.indexOf(`${callee}(`);
  if (start < 0) return undefined;
  return source.slice(start, groupEnd(source, start + callee.length) + 1);
};

export { callText, shellEntries };
