'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import { load } from 'js-yaml';
import { globSync } from 'node:fs';

const installsGit = (step) =>
  /^\s*(?:sudo\s+)?(?:dnf|yum|apt-get|apt)\s+install\b.*\sgit(?:\s|$)/m.test(step.run ?? '');
const checksOut = (step) => (step.uses ?? '').startsWith('actions/checkout@');

/** The container jobs of a workflow that install git after they check out the repository. */
const lateGitInstalls = (file, document) =>
  Object.entries(document?.jobs ?? {})
    .filter(([, { container, steps = [] }]) => {
      const install = steps.findIndex(installsGit);
      const checkout = steps.findIndex(checksOut);
      return container && install !== -1 && checkout !== -1 && install > checkout;
    })
    .map(([id]) => `${file}#${id}: git installed after checkout`);

describe('workflow checkout', () => {
  it('installs git before a container job checks out the repository', () => {
    // A checkout without git is an archive with no .git: every git command in the job fails.
    const offences = globSync('.github/workflows/*.yml').flatMap((file) =>
      lateGitInstalls(file, load(fs.readFileSync(file, 'utf8'))),
    );
    expect(offences, offences.join('\n')).to.deep.equal([]);
  });

  it('flags only a container job that installs git after the checkout', () => {
    const steps = [{ uses: 'actions/checkout@v7' }, { run: 'dnf install -y sudo tar git\ndnf install -y curl' }];
    const document = {
      jobs: {
        late: { container: { image: 'rockylinux:9' }, steps },
        early: { container: { image: 'rockylinux:9' }, steps: [...steps].reverse() },
        host: { steps },
      },
    };
    expect(lateGitInstalls('fixture.yml', document)).to.deep.equal(['fixture.yml#late: git installed after checkout']);
  });
});
