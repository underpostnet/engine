import { expect } from 'chai';
import { shellHarness } from '../../support/shell-harness.js';

// The command, not its effect: a real run would delete the replica volumes on this host.
const commands = [];
const respond = (command) => {
  if (command === 'kind get nodes') return 'kind-control-plane\nkind-worker';
  if (command.includes('docker inspect')) return 'yes';
  if (command.includes('get storageclass')) return 'kubernetes.io/no-provisioner';
  const claim = command.match(/get pvc mongodb-storage-mongodb-(\d+)/);
  if (claim) return `mongodb-pv-${claim[1]}`;
  const volume = command.match(/get pv mongodb-pv-(\d+)/);
  if (volume) return `/data/mongodb/v${volume[1]}`;
  return '';
};
vi.mock('../../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  makeHostDirectory: (target) => commands.push(`makeHostDirectory ${target}`),
  removeHostPath: (target) => commands.push(`removeHostPath ${target}`),
  shellExec: (command, options = {}) => {
    commands.push(command);
    const stdout = respond(command);
    return options.stdout ? stdout : { code: 0, stdout, stderr: '' };
  },
}));

const { MongoBootstrap } = await import('../../../src/db/mongo/mongo-bootstrap.js');
const { default: Underpost } = await import('../../../src/index.js');

const WIPE = /delete pvc|delete pv |removeHostPath \/data\/mongodb|-mindepth 1 -delete/;

const restore = (options) =>
  MongoBootstrap.initReplicaSet({ namespace: 'default', clusterType: 'kind', underpostRoot: '.', ...options });

describe('MongoDB replica restore', () => {
  let harness;
  beforeEach(() => {
    commands.length = 0;
    // The modules this mock does not reach run through the shell harness: no command meets a real cluster.
    harness = shellHarness([
      {
        match: /kubectl get pv 'mongodb-pv-\d'/,
        get stdout() {
          const ordinal = /mongodb-pv-(\d)/.exec(harness.calls.at(-1))[1];
          return `default/mongodb-storage-mongodb-${ordinal}/uid-${ordinal}`;
        },
      },
    ]);
    vi.spyOn(Underpost.kubectl, 'waitForPodsReady').mockResolvedValue([]);
    vi.spyOn(Underpost.secret, 'provide').mockReturnValue({ source: 'sops', namespace: 'default', secrets: [] });
    vi.spyOn(Underpost.secret, 'liveData').mockReturnValue({ data: { username: 'root', password: 'pw' } });
  });

  afterEach(() => {
    harness.restore();
    vi.restoreAllMocks();
  });

  it('keeps claims, volumes and member data on a Kind restore', async () => {
    await restore({ reset: false });
    expect(commands.filter((command) => WIPE.test(command))).to.deep.equal([]);
    expect(harness.calls).to.include("kubectl kustomize './manifests/mongodb'");
    expect(harness.calls.some((call) => call.startsWith("kubectl apply -n 'default' -f - <<'EOF'"))).to.equal(true);
    // The volume guard reads each replica volume, finds its own claim, and changes nothing.
    expect(harness.calls.filter((call) => call.startsWith("kubectl get pv 'mongodb-pv-"))).to.have.length(3);
    expect(harness.calls.some((call) => call.includes(' patch pv '))).to.equal(false);
    expect(commands.some((command) => command.includes('mongosh'))).to.equal(true);
  });

  it('wipes them only on an explicit reset', async () => {
    await restore({ reset: true });
    expect(commands).to.include('kubectl delete pvc mongodb-storage-mongodb-0 -n default --ignore-not-found');
    expect(commands).to.include.members(['makeHostDirectory /data/mongodb', 'removeHostPath /data/mongodb/v0']);
  });
});
