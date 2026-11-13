/**
 * Conventional Commit messages: `type(scope): description`. The known types carry the description
 * a commit without one gets, and the emoji Underpost presents after the colon; any other lowercase
 * type is a custom type and needs its own description. Nothing reads the emoji back.
 * @module src/server/release/commit-message.js
 * @namespace CommitMessage
 */

/**
 * The known commit types.
 * @type {Readonly<Object<string, {emoji: string, description: string}>>}
 * @memberof CommitMessage
 */
const COMMIT_TYPES = Object.freeze({
  feat: { emoji: '✨', description: 'New feature or enhancement (frontend, backend, API, or UX)' },
  fix: { emoji: '🐛', description: 'Fix a bug' },
  docs: { emoji: '📚', description: 'Documentation changes' },
  style: { emoji: '💎', description: 'Formatting, whitespace, semicolons, code style' },
  refactor: { emoji: '📦', description: 'Code refactor.' },
  perf: { emoji: '⚡️', description: 'Performance improvements across the stack.' },
  ci: { emoji: '⚙️', description: 'CI pipeline changes (GitHub Actions, runners, caching)' },
  cd: { emoji: '🚀', description: 'CD / deployment changes (Remote ssh deployment scripts)' },
  infra: { emoji: '🏗️', description: 'Infrastructure changes (MAAS, LXD, cloud infra, networking, provisioning).' },
  build: { emoji: '🛠', description: 'Build system or dependency changes (tooling, bundler, build scripts).' },
  test: { emoji: '🚨', description: 'Unit or integration tests added/updated, test helpers, flake fixes.' },
  chore: { emoji: '♻️', description: "Other changes that don't modify src or tests (automation, housekeeping)." },
  revert: { emoji: '🗑', description: 'Revert a previous commit or change.' },
  backup: { emoji: '💾', description: 'Backups, snapshotting, restore scripts, or backup docs.' },
});

const COMMIT_SUBJECT = /^[a-z][a-z0-9-]*(\([^()\r\n]+\))?!?: \S/;

/**
 * A Conventional Commit message. A multi-line description becomes the subject and the body.
 * @param {object} params
 * @param {string} params.type - A known or a custom type.
 * @param {string} [params.scope]
 * @param {string} [params.description] - The default description of a known type otherwise.
 * @returns {string}
 * @throws {Error} When the type is not a lowercase word or the message has no description.
 * @memberof CommitMessage
 */
const commitMessageFactory = ({ type, scope = '', description = '' }) => {
  const kind = `${type ?? ''}`.trim();
  const known = Object.hasOwn(COMMIT_TYPES, kind) ? COMMIT_TYPES[kind] : null;
  const text = `${description ?? ''}`.trim() || known?.description || '';
  if (!text) throw new Error(`[commit] the custom type '${kind}' needs a description`);
  const context = `${scope ?? ''}`.trim();
  const message = `${kind}${context ? `(${context})` : ''}: ${known ? `${known.emoji} ` : ''}${text}`;
  if (!COMMIT_SUBJECT.test(message))
    throw new Error(
      `[commit] '${message.split('\n')[0]}' is not a Conventional Commit subject: type(scope): description`,
    );
  return message;
};

export { COMMIT_TYPES, commitMessageFactory };
