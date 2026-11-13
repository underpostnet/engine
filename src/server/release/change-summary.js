/**
 * Change summaries and the changelog, both read from the tagged commits of a history: a commit whose
 * subject is `[scope] subject` is one entry; any other commit is none. A subject holding
 * `New release v:<version>` starts the section of that version in the changelog.
 *
 * A change summary is data, generated once and carried unchanged from repository to repository:
 *
 *   { "schema": 1, "source": { "repository": "owner/repo", "revision": "<sha>" },
 *     "entries": [{ "scope": "cli", "subject": "Add x", "revision": "<sha>" }] }
 *
 * It travels as a workflow dispatch input (the JSON), or inside a commit message as the
 * `Change-Summary:` trailer of {@link changeMessage}, so a hop triggered by a push reads it back
 * from the commit exactly as it was sent. Nothing is reconstructed from a commit subject.
 * @module src/server/release/change-summary.js
 * @namespace ChangeSummary
 */

import fs from 'fs-extra';
import nodePath from 'node:path';
import { commitHistory, githubSlug, headRevision, remoteUrl } from '../git/git.js';

/** @memberof ChangeSummary */
const CHANGE_SUMMARY_SCHEMA = 1;

/** The commit message trailer that carries a change summary. @memberof ChangeSummary */
const CHANGE_SUMMARY_TRAILER = 'Change-Summary';

const RELEASE_MARK = 'New release v:';
const TAGGED_SUBJECT = /^\[([^\]]+)\]\s*(.*)$/;
const REVISION = /^[0-9a-f]{7,64}$/;
const TRAILER = new RegExp(`^${CHANGE_SUMMARY_TRAILER}: (\\{.*\\})\\s*$`, 'gm');

/** The entry of a tagged subject, or null. */
const taggedEntry = (subject) => {
  const match = TAGGED_SUBJECT.exec(`${subject ?? ''}`.trim());
  const text = match?.[2].trim();
  return text ? { scope: match[1].trim(), subject: text } : null;
};

/**
 * A change summary in its canonical form: validated, its keys in one order, so the same summary
 * always serializes to the same text.
 * @param {object} value
 * @returns {{schema: number, source: {repository?: string, revision?: string}, entries: Array<{scope?: string, subject: string, revision?: string}>}}
 * @throws {Error} When the value is not a change summary of a known schema.
 * @memberof ChangeSummary
 */
const changeSummary = (value) => {
  if (value?.schema !== CHANGE_SUMMARY_SCHEMA)
    throw new Error(
      `[change-summary] unsupported schema ${JSON.stringify(value?.schema)}: expected ${CHANGE_SUMMARY_SCHEMA}`,
    );
  if (!Array.isArray(value.entries)) throw new Error('[change-summary] entries must be a list');
  const text = (field) => (typeof field === 'string' && field.trim() ? field.trim() : '');
  const revision = (field) => (REVISION.test(text(field)) ? text(field) : '');
  const source = {};
  if (text(value.source?.repository)) source.repository = text(value.source.repository);
  if (revision(value.source?.revision)) source.revision = revision(value.source.revision);
  return {
    schema: CHANGE_SUMMARY_SCHEMA,
    source,
    entries: value.entries.map((entry) => {
      if (!text(entry?.subject)) throw new Error('[change-summary] every entry needs a subject');
      return {
        ...(text(entry.scope) ? { scope: text(entry.scope) } : {}),
        subject: text(entry.subject),
        ...(revision(entry.revision) ? { revision: revision(entry.revision) } : {}),
      };
    }),
  };
};

/**
 * The change summary of the latest commits of a checkout.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {number} [params.count=1] - How many commits, from HEAD.
 * @returns {ReturnType<typeof changeSummary>}
 * @memberof ChangeSummary
 */
const changeSummaryFactory = ({ path = '.', count = 1 } = {}) => {
  const url = remoteUrl(path);
  return changeSummary({
    schema: CHANGE_SUMMARY_SCHEMA,
    source: { repository: githubSlug(url), revision: headRevision(path) },
    entries: commitHistory({ path, count: Math.max(1, Number.parseInt(count, 10) || 1) })
      .map(({ subject, revision }) => {
        const entry = taggedEntry(subject);
        return entry && { ...entry, revision };
      })
      .filter(Boolean),
  });
};

/**
 * Reads a change summary that travelled as text: the JSON of one, a commit message carrying one in
 * its {@link CHANGE_SUMMARY_TRAILER} trailer, or a plain message, each line of which is an entry.
 * @param {string} raw
 * @returns {ReturnType<typeof changeSummary>|null} null for empty text.
 * @throws {Error} When the JSON or the trailer holds no valid change summary.
 * @memberof ChangeSummary
 */
const resolveChangeSummary = (raw) => {
  const text = `${raw ?? ''}`.trim();
  if (!text) return null;
  if (text.startsWith('{')) return changeSummary(JSON.parse(text));
  const trailer = [...text.matchAll(TRAILER)].pop();
  if (trailer) return changeSummary(JSON.parse(trailer[1]));
  return changeSummary({
    schema: CHANGE_SUMMARY_SCHEMA,
    source: {},
    entries: text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => taggedEntry(line) ?? { subject: line }),
  });
};

/**
 * The JSON of a change summary, in its canonical form.
 * @param {object} summary
 * @returns {string}
 * @memberof ChangeSummary
 */
const serializeChangeSummary = (summary) => JSON.stringify(changeSummary(summary));

const entryLine = ({ scope, subject }) => (scope ? `[${scope}] ${subject}` : subject);

/**
 * The commit message of a change summary: one line per entry, then the trailer that carries the
 * summary itself.
 * @param {object} summary
 * @returns {string} '' when the summary has no entry.
 * @memberof ChangeSummary
 */
const changeMessage = (summary) => {
  const { entries } = changeSummary(summary);
  if (!entries.length) return '';
  return `${entries.map(entryLine).join('\n')}\n\n${CHANGE_SUMMARY_TRAILER}: ${serializeChangeSummary(summary)}`;
};

const commitLink = (repository, revision, short = revision?.slice(0, 9)) =>
  githubSlug(`https://github.com/${repository ?? ''}`) && revision
    ? ` ([${short}](https://github.com/${repository}/commit/${revision}))`
    : '';

/** Markdown groups of entries by scope, in the order each scope first appears. */
const scopeSections = (entries, line) => {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.scope)) groups.set(entry.scope, []);
    groups.get(entry.scope).push(entry);
  }
  return [...groups]
    .map(
      ([scope, group]) => `${scope ? `### ${scope}\n\n` : ''}${group.map((entry) => `- ${line(entry)}\n`).join('')}\n`,
    )
    .join('');
};

/**
 * A change summary as Markdown: its entries grouped by scope, each linked to its commit.
 * @param {object} summary
 * @returns {string}
 * @memberof ChangeSummary
 */
const changeMarkdown = (summary) => {
  const { source, entries } = changeSummary(summary);
  return scopeSections(entries, (entry) => `${entry.subject}${commitLink(source.repository, entry.revision)}`);
};

/**
 * The changelog of a checkout: the changes since the last release, then the section of each of the
 * five latest releases, stopping early at `minVersion`.
 * @param {object} [params]
 * @param {string} [params.path='.']
 * @param {string} [params.minVersion='2.97.1'] - The oldest release section.
 * @returns {string} Markdown.
 * @memberof ChangeSummary
 */
const changelogFactory = ({ path = '.', minVersion = '2.97.1' } = {}) => {
  const repository = githubSlug(remoteUrl(path));
  const sections = [];
  let section = { title: '', date: new Date().toISOString().split('T')[0], entries: [] };
  for (const commit of commitHistory({ path })) {
    const mark = commit.subject.indexOf(RELEASE_MARK);
    if (mark === -1) {
      const entry = taggedEntry(commit.subject);
      if (entry) section.entries.push({ ...entry, revision: commit.revision, short: commit.shortRevision });
      continue;
    }
    sections.push(section);
    const version = commit.subject.slice(mark + RELEASE_MARK.length).trim();
    if (sections.filter(({ title }) => title).length === 5 || sections.at(-1).version === minVersion) break;
    section = { title: `${RELEASE_MARK}${version}`, version, date: commit.date.split(' ')[0], entries: [] };
  }
  if (section.entries.length && !sections.includes(section)) sections.push(section);
  const changelog = sections
    .filter(({ entries }) => entries.length)
    .map(
      ({ title, date, entries }) =>
        `## ${title ? `${title} (${date})` : date}\n\n` +
        scopeSections(
          entries,
          (entry) => `${entry.subject.replaceAll('"', '')}${commitLink(repository, entry.revision, entry.short)}`,
        ),
    )
    .join('');
  return changelog || 'No changelog entries found.\n';
};

/**
 * Writes the `CHANGELOG.md` of a checkout from {@link changelogFactory}.
 * @param {object} [params] - The parameters of {@link changelogFactory}.
 * @returns {string} The file written.
 * @memberof ChangeSummary
 */
const writeChangelog = ({ path = '.', minVersion } = {}) => {
  const file = nodePath.join(path, 'CHANGELOG.md');
  fs.writeFileSync(file, `# Changelog\n\n${changelogFactory({ path, minVersion })}`);
  return file;
};

export {
  CHANGE_SUMMARY_SCHEMA,
  CHANGE_SUMMARY_TRAILER,
  changeMarkdown,
  changeMessage,
  changeSummary,
  changeSummaryFactory,
  changelogFactory,
  resolveChangeSummary,
  serializeChangeSummary,
  writeChangelog,
};
