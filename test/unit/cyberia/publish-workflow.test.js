import { expect } from 'chai';
import fs from 'fs-extra';
// Named import: js-yaml's ESM build exports no default.
import { load } from 'js-yaml';

describe('the cyberia publish workflow', () => {
  it('rewrites the published manifest after the install and before every publish', () => {
    // The rewrite is the publish step's alone: a checkout that installed the published shape
    // would run the engine source against a second engine in node_modules.
    const workflow = load(fs.readFileSync('./.github/workflows/publish.cyberia.ci.yml', 'utf8'));

    for (const [job, { steps }] of Object.entries(workflow.jobs)) {
      const commands = steps.map(({ run }) => `${run ?? ''}`);
      const restore = commands.findIndex((command) => command.includes('publishedProductPackageJson'));
      const install = commands.findIndex((command) => command.trim().startsWith('npm ci'));
      const publish = commands.findIndex((command) => command.includes('npm publish'));

      expect(restore, `${job}: restores the published manifest`).to.be.greaterThan(install);
      expect(restore, `${job}: restores it before publishing`).to.be.lessThan(publish);
    }
  });
});
