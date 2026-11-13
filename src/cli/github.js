/**
 * The `underpost github` commands: workflow dispatch and repository metadata, delegated to the
 * GitHub REST client ({@link module:src/server/github/github-client.js}).
 * @module src/cli/github.js
 * @namespace UnderpostGithub
 */

import { dispatchWorkflow, repositoryMetadata } from '../server/github/github-client.js';
import { githubSlug, remoteUrl } from '../server/git/git.js';

/** `--input key=value` entries as an object; a value may hold `=`, commas and newlines. */
const inputsFactory = (entries = []) =>
  Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf('=');
      if (separator < 1) throw new Error(`--input takes key=value, not '${entry}'`);
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );

/** The repository a command names, else the GitHub origin of the working directory. */
const repositoryOf = (repository) => {
  const resolved = repository || githubSlug(remoteUrl('.'));
  if (!resolved) throw new Error('Name a repository: the working directory has no GitHub origin');
  return resolved;
};

/**
 * @class UnderpostGithub
 * @memberof UnderpostGithub
 */
class UnderpostGithub {
  static API = {
    /**
     * `underpost github dispatch`: dispatches a workflow and prints the run GitHub created.
     * @param {string} repository
     * @param {string} workflow
     * @param {object} [options] - `ref`, `input` (`key=value` entries).
     * @memberof UnderpostGithub
     */
    async dispatch(repository, workflow, options = {}) {
      const run = await dispatchWorkflow({
        repository,
        workflow,
        ref: options.ref,
        inputs: inputsFactory(options.input),
      });
      console.log(
        run.runId
          ? `Run ${run.runId} created on ${run.ref}: ${run.url}`
          : `Dispatch accepted on ${run.ref}: ${run.url}`,
      );
      return run;
    },

    /**
     * `underpost github repo`: prints the metadata of a repository.
     * @param {string} [repository]
     * @memberof UnderpostGithub
     */
    async repo(repository) {
      const metadata = await repositoryMetadata(repositoryOf(repository));
      console.log(JSON.stringify(metadata, null, 2));
      return metadata;
    },
  };
}

export default UnderpostGithub;
