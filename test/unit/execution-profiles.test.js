'use strict';

import { expect } from 'chai';
import {
  activeExecutionProfile,
  CAPABILITIES,
  classifyCommand,
  cli,
  EXECUTION_PROFILE_ENV_KEY,
  EXECUTION_PROFILES,
  executionDecisionFactory,
  executionProfileFactory,
  profileFromOptionsFactory,
  withExecutionProfile,
} from '../../src/server/build/execution.js';

describe('command capability classification', () => {
  it('separates cluster reads from cluster writes', () => {
    expect(classifyCommand('kubectl get pods')).to.equal('cluster:read');
    expect(classifyCommand('kubectl describe svc x -n default')).to.equal('cluster:read');
    expect(classifyCommand('kubectl apply -f manifest.yaml')).to.equal('cluster:write');
    expect(classifyCommand('kubectl delete secret underpost-config -n default')).to.equal('cluster:write');
    expect(classifyCommand('kubectl exec pod -- sh -c ls')).to.equal('cluster:write');
  });

  it('finds the verb past kubectl flags that consume their next token', () => {
    expect(classifyCommand('kubectl -n default get pods')).to.equal('cluster:read');
    expect(classifyCommand('kubectl --namespace default --context x get svc')).to.equal('cluster:read');
    expect(classifyCommand('kubectl -n default apply -f x.yaml')).to.equal('cluster:write');
  });

  it('treats an unrecognised kubectl verb as a write rather than assuming it is harmless', () => {
    expect(classifyCommand('kubectl some-future-verb thing')).to.equal('cluster:write');
  });

  it('classifies through sudo rather than stopping at it', () => {
    expect(classifyCommand('sudo kubectl apply -f x.yaml')).to.equal('cluster:write');
    expect(classifyCommand('sudo kubectl get pods')).to.equal('cluster:read');
    expect(classifyCommand('sudo -u dd kubectl get pods')).to.equal('cluster:read');
  });

  it('treats an escalated unknown command as a host mutation', () => {
    expect(classifyCommand('sudo some-vendor-tool --install')).to.equal('host:write');
    expect(classifyCommand('some-vendor-tool --install')).to.equal('fs');
  });

  it('takes the most privileged segment of a compound command', () => {
    expect(classifyCommand('kubectl create secret generic x --dry-run=client -o yaml | kubectl apply -f -')).to.equal(
      'cluster:write',
    );
    expect(classifyCommand('cd /home/dd && git add . && kubectl apply -f x.yaml')).to.equal('cluster:write');
    expect(classifyCommand('cd /home/dd/cyberia-instances && git status')).to.equal('git');
  });

  it('reads a heredoc as data, not as a pipeline', () => {
    const cmd = ["kubectl apply -f - -n default <<'EOF'", 'apiVersion: v1', 'kind: Secret', 'EOF'].join('\n');
    expect(classifyCommand(cmd)).to.equal('cluster:write');
  });

  it('classifies host, network and git work distinctly', () => {
    expect(classifyCommand('sudo dnf install -y cockpit')).to.equal('host:write');
    expect(classifyCommand('sudo systemctl enable --now cockpit.socket')).to.equal('host:write');
    expect(classifyCommand('curl https://example.com')).to.equal('net');
    expect(classifyCommand('git add .')).to.equal('git');
  });

  it('lets nested engine invocations through so a profile can reach its own stages', () => {
    expect(classifyCommand('node bin deploy --build-manifest dd development')).to.equal('fs');
    expect(classifyCommand('cd /x && underpost pull . underpostnet/cyberia-instances')).to.equal('fs');
  });

  it('never returns a capability outside the declared set', () => {
    const commands = [
      '',
      '   ',
      'echo hi',
      'NODE_ENV=production node bin client',
      'sudo',
      'kubectl',
      'helm list -n default',
      'helm upgrade --install x ./chart',
    ];
    for (const cmd of commands) expect(CAPABILITIES).to.include(classifyCommand(cmd));
  });
});

describe('execution profiles', () => {
  it('permits everything under LIVE_CLUSTER', () => {
    for (const capability of CAPABILITIES) expect(EXECUTION_PROFILES.LIVE_CLUSTER.permits).to.include(capability);
  });

  it('permits build outputs but no environment mutation under HERMETIC_BUILD', () => {
    const { permits } = EXECUTION_PROFILES.HERMETIC_BUILD;
    expect(permits).to.have.members(['fs', 'git']);
    for (const denied of ['cluster:read', 'cluster:write', 'host:write', 'net']) expect(permits).to.not.include(denied);
  });

  it('permits nothing under OFFLINE_DRY_RUN', () => {
    expect(EXECUTION_PROFILES.OFFLINE_DRY_RUN.permits).to.deep.equal([]);
  });

  it('falls back to the default profile rather than throwing on an unknown name', () => {
    expect(executionProfileFactory('nope').name).to.equal('LIVE_CLUSTER');
    expect(executionProfileFactory('').name).to.equal('LIVE_CLUSTER');
    expect(executionProfileFactory(undefined).name).to.equal('LIVE_CLUSTER');
  });

  it('accepts a profile name in either kebab or snake form', () => {
    expect(executionProfileFactory('hermetic-build').name).to.equal('HERMETIC_BUILD');
    expect(executionProfileFactory('hermetic_build').name).to.equal('HERMETIC_BUILD');
  });
});

describe('execution decisions', () => {
  it('denies cluster work under HERMETIC_BUILD and permits build output', () => {
    const denied = executionDecisionFactory('kubectl delete secret x -n default', { profile: 'HERMETIC_BUILD' });
    expect(denied.permitted).to.equal(false);
    expect(denied.capability).to.equal('cluster:write');
    expect(denied.neutral).to.equal(true);
    expect(executionDecisionFactory('git add .', { profile: 'HERMETIC_BUILD' }).permitted).to.equal(true);
  });

  it('permits the same command under LIVE_CLUSTER', () => {
    expect(
      executionDecisionFactory('kubectl delete secret x -n default', { profile: 'LIVE_CLUSTER' }).permitted,
    ).to.equal(true);
  });

  it('denies even local work under OFFLINE_DRY_RUN', () => {
    expect(executionDecisionFactory('echo hi', { profile: 'OFFLINE_DRY_RUN' }).permitted).to.equal(false);
  });
});

describe('profile propagation', () => {
  const originalProfile = process.env[EXECUTION_PROFILE_ENV_KEY];

  afterEach(() => {
    if (originalProfile === undefined) delete process.env[EXECUTION_PROFILE_ENV_KEY];
    else process.env[EXECUTION_PROFILE_ENV_KEY] = originalProfile;
  });

  it('exports the profile to the environment so child processes inherit it', () => {
    withExecutionProfile('HERMETIC_BUILD', () => {
      expect(process.env[EXECUTION_PROFILE_ENV_KEY]).to.equal('HERMETIC_BUILD');
      expect(activeExecutionProfile().name).to.equal('HERMETIC_BUILD');
    });
    expect(process.env[EXECUTION_PROFILE_ENV_KEY]).to.equal(originalProfile);
  });

  it('restores the previous profile when the body throws', () => {
    expect(() =>
      withExecutionProfile('OFFLINE_DRY_RUN', () => {
        throw new Error('stage failed');
      }),
    ).to.throw('stage failed');
    expect(process.env[EXECUTION_PROFILE_ENV_KEY]).to.equal(originalProfile);
  });

  it('restores the previous profile after an async body settles', async () => {
    await withExecutionProfile('HERMETIC_BUILD', async () => {
      expect(activeExecutionProfile().name).to.equal('HERMETIC_BUILD');
    });
    expect(process.env[EXECUTION_PROFILE_ENV_KEY]).to.equal(originalProfile);
  });

  it('nests without leaking the inner profile outward', () => {
    withExecutionProfile('HERMETIC_BUILD', () => {
      withExecutionProfile('OFFLINE_DRY_RUN', () => {
        expect(activeExecutionProfile().name).to.equal('OFFLINE_DRY_RUN');
      });
      expect(activeExecutionProfile().name).to.equal('HERMETIC_BUILD');
    });
  });

  it('defaults to LIVE_CLUSTER when the environment says nothing', () => {
    delete process.env[EXECUTION_PROFILE_ENV_KEY];
    expect(activeExecutionProfile().name).to.equal('LIVE_CLUSTER');
  });
});

describe('legacy bypass flag aliases', () => {
  it('prefers an explicit --profile over every alias', () => {
    expect(profileFromOptionsFactory({ profile: 'OFFLINE_DRY_RUN', disableUpdateUnderpostConfig: true })).to.equal(
      'OFFLINE_DRY_RUN',
    );
  });

  it('aliases the legacy flag only in the mode where it means the same thing', () => {
    expect(profileFromOptionsFactory({ disableUpdateUnderpostConfig: true, buildManifest: true })).to.equal(
      'HERMETIC_BUILD',
    );
    // A live deploy carrying the same flag must stay live: it is a step toggle there, and
    // silently eliding every cluster write would turn the deploy into a no-op.
    expect(profileFromOptionsFactory({ disableUpdateUnderpostConfig: true })).to.equal('');
  });

  it('selects nothing when no flag and no profile is given', () => {
    expect(profileFromOptionsFactory({})).to.equal('');
    expect(profileFromOptionsFactory()).to.equal('');
  });
});

describe('CLI resolution', () => {
  it('resolves underpost to a runnable command', () => {
    const resolved = cli();
    expect(resolved === 'underpost' || /^node \/.+\/bin\/index\.js$/.test(resolved)).to.equal(true);
  });

  it('re-enters this checkout under local, never a global install', () => {
    // A globally installed underpost is a different package: resolving to it for a stage
    // that operates on this working tree runs the wrong code against the right cwd.
    expect(cli('underpost', { local: true })).to.match(/^node \/.+\/bin\/index\.js$/);
    expect(cli('underpost', { local: true })).to.not.equal('underpost');
  });

  it('passes through any other binary name unchanged', () => {
    expect(cli('kubectl')).to.equal('kubectl');
  });
});
