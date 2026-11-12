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
  setExecutionTarget,
  targetDecisionFactory,
  targetIdentityRefusal,
  withExecutionProfile,
} from '../../../src/server/build/execution.js';

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
    expect(classifyCommand('cd /home/dd/cyberia-deployment && git status')).to.equal('git');
  });

  it('reads a heredoc as data, not as a pipeline', () => {
    const cmd = ["kubectl apply -f - -n default <<'EOF'", 'apiVersion: v1', 'kind: Secret', 'EOF'].join('\n');
    expect(classifyCommand(cmd)).to.equal('cluster:write');
  });

  it('classifies host, network and git work distinctly', () => {
    expect(classifyCommand('sudo dnf install -y cockpit')).to.equal('host:write');
    expect(classifyCommand('sudo systemctl enable --now cockpit.socket')).to.equal('host:write');
    expect(classifyCommand('curl https://example.com')).to.equal('net');
    expect(classifyCommand("'/x/node_modules/.bin/socket' 'scan' 'create' '--json' '.'")).to.equal('net');
    expect(classifyCommand('git add .')).to.equal('git');
  });

  it('lets nested engine invocations through so a profile can reach its own stages', () => {
    expect(classifyCommand('node bin deploy --build-manifest dd development')).to.equal('fs');
    expect(classifyCommand('cd /x && underpost pull . underpostnet/cyberia-deployment')).to.equal('fs');
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

  it('classifies the argument vector of a program without reading its arguments as shell syntax', () => {
    const read = ['kubectl', 'get', 'services', '-o', 'jsonpath={range .items[*]}{.metadata.name}|{end}'];
    expect(executionDecisionFactory(read, { profile: 'LIVE_CLUSTER' }).capability).to.equal('cluster:read');
    expect(
      executionDecisionFactory(['kubectl', 'patch', 'cronjob', 'x'], { profile: 'LIVE_CLUSTER' }).capability,
    ).to.equal('cluster:write');
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

describe('cluster target decisions', () => {
  const REFUSED = { environment: 'production', context: '', source: '', refusal: 'name a context' };
  const PINNED = { environment: 'production', context: 'admin@prod', source: 'environments.production.context' };
  const decide = (cmd, target) => targetDecisionFactory(cmd, classifyCommand([].concat(cmd).join(' ')), target);

  it('refuses each cluster command of a refused target that names no context of its own', () => {
    expect(decide('kubectl get pods', REFUSED).refusal).to.equal('name a context');
    expect(decide('kubectl get pods | kubectl apply -f -', REFUSED).refusal).to.equal('name a context');
    expect(decide(['helm', 'upgrade', '--install', 'x', 'y'], REFUSED).refusal).to.equal('name a context');
  });

  it('lets a command that names its context or kubeconfig, a kubeconfig read and local helm work through', () => {
    expect(decide('kubectl --context admin@prod get pods', REFUSED).refusal).to.equal('');
    expect(decide(['kubectl', '--kubeconfig', '/tmp/k', 'get', 'nodes'], REFUSED).refusal).to.equal('');
    expect(decide('KUBECONFIG=/tmp/k kubectl get nodes', REFUSED).refusal).to.equal('');
    expect(decide('kubectl config current-context', REFUSED).refusal).to.equal('');
    expect(decide('helm repo add jetstack https://charts.jetstack.io', REFUSED).refusal).to.equal('');
    expect(decide('ls -la', REFUSED).refusal).to.equal('');
  });

  it('decides nothing without a target: an API caller outside the CLI chooses its own cluster', () => {
    expect(decide('kubectl apply -f x.yaml', null)).to.deep.equal({ refusal: '', verify: false });
  });

  it('verifies the cluster of a change through the target, and of every cluster command under an override', () => {
    expect(decide('kubectl apply -f x.yaml', PINNED).verify).to.equal(true);
    expect(decide(['kubectl', '--context', 'admin@prod', 'delete', 'pod', 'x'], PINNED).verify).to.equal(true);
    expect(decide("kubectl --context='admin@prod' apply -f -", PINNED).verify).to.equal(true);
    expect(decide('kubectl get pods', PINNED).verify).to.equal(false);
    expect(decide('kubectl get pods', { ...PINNED, override: true }).verify).to.equal(true);
    expect(decide('kubectl config view', { ...PINNED, override: true }).verify).to.equal(false);
    // A command that names another context or its own kubeconfig chooses its cluster itself.
    expect(decide('kubectl --context kind-kind apply -f x.yaml', PINNED).verify).to.equal(false);
    expect(decide('kubectl --kubeconfig /tmp/k apply -f x.yaml', PINNED).verify).to.equal(false);
  });

  it('refuses a change, never a read, through a target with blockers', () => {
    const blocked = { ...PINNED, blockers: ['environments.production.tls names no TLS policy'] };
    expect(decide('kubectl apply -f x.yaml', blocked)).to.deep.equal({
      refusal: 'The production target refuses a change: environments.production.tls names no TLS policy',
      verify: false,
    });
    expect(decide(['helm', 'upgrade', '--install', 'x', 'y'], blocked).refusal).to.contain('refuses a change');
    expect(decide('kubectl get pods', blocked)).to.deep.equal({ refusal: '', verify: false });
    expect(decide('kubectl --context kind-kind apply -f x.yaml', blocked).refusal).to.equal('');
  });

  it('refuses a cluster that is not the declared one, or that does not answer', () => {
    const declared = { ...PINNED, cluster: { fingerprint: 'uid-a', servers: ['https://10.0.0.1:6443'] } };
    const live = { server: 'https://10.0.0.1:6443', fingerprint: 'uid-a' };
    expect(targetIdentityRefusal(declared, live)).to.equal('');
    expect(targetIdentityRefusal(PINNED, { server: '', fingerprint: '' })).to.equal('');
    expect(targetIdentityRefusal(declared, { ...live, fingerprint: 'uid-b' })).to.equal(
      'admin@prod reaches the cluster uid-b, and environments.production.cluster declares uid-a: check the context',
    );
    expect(targetIdentityRefusal(declared, { ...live, server: 'https://10.0.0.9:6443' })).to.contain(
      'reaches the API server https://10.0.0.9:6443, which environments.production.cluster.servers does not list',
    );
    expect(targetIdentityRefusal({ ...declared, cluster: { fingerprint: 'uid-a', servers: [] } }, live)).to.equal('');
    expect(targetIdentityRefusal(declared, { server: '', fingerprint: '' })).to.contain('does not answer');
  });

  it('carries the target to child processes through the environment', () => {
    setExecutionTarget(PINNED);
    try {
      expect(JSON.parse(process.env.UNDERPOST_CLUSTER_TARGET)).to.deep.equal(PINNED);
      expect(targetDecisionFactory('kubectl apply -f x.yaml', 'cluster:write').verify).to.equal(true);
    } finally {
      setExecutionTarget(null);
    }
    expect(process.env.UNDERPOST_CLUSTER_TARGET).to.equal(undefined);
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
