/**
 * The content view of the running request: which database a host's versioned content is read
 * from. `served` reads the active content release; `workspace` reads the content being authored.
 * A process with no request (the CLI, a migration) works on the workspace; the runtime paths
 * say `served`.
 *
 * @module src/db/content-view.js
 * @namespace ContentView
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const views = new AsyncLocalStorage();

/** The views a request can read. */
export const CONTENT_VIEWS = Object.freeze(['workspace', 'served']);

/**
 * Runs `fn` with a content view for everything it awaits.
 * @param {string} view - One of {@link CONTENT_VIEWS}.
 * @param {Function} fn
 * @returns {*} What `fn` returns.
 * @memberof ContentView
 */
export const runInContentView = (view, fn) => {
  if (!CONTENT_VIEWS.includes(view)) throw new Error(`Unknown content view "${view}"`);
  return views.run(view, fn);
};

/**
 * The view of the running code; `workspace` outside any request.
 * @returns {string}
 * @memberof ContentView
 */
export const currentContentView = () => views.getStore() ?? 'workspace';
