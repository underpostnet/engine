import { expect } from 'chai';

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
  shellExec: (command, options = {}) => {
    commands.push(command);
    const stdout = respond(command);
    return options.stdout ? stdout : { code: 0, stdout, stderr: '' };
  },
}));

const { MongoBootstrap } = await import('../../../src/db/mongo/MongoBootstrap.js');
const { default: Underpost } = await import('../../../src/index.js');

const WIPE = /delete pvc|delete pv |rm -rf \/data\/mongodb|-mindepth 1 -delete/;

const restore = (options) =>
  MongoBootstrap.initReplicaSet({ namespace: 'default', clusterType: 'kind', underpostRoot: '.', ...options });

describe('MongoDB replica restore', () => {
  beforeEach(() => {
    commands.length = 0;
    vi.spyOn(Underpost.kubectl, 'waitForPodsReady').mockResolvedValue([]);
    vi.spyOn(Underpost.secret, 'applyIfPresent').mockReturnValue(true);
    vi.spyOn(Underpost.secret, 'seedSources').mockReturnValue({});
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps claims, volumes and member data on a Kind restore', async () => {
    await restore({ reset: false });
    expect(commands.filter((command) => WIPE.test(command))).to.deep.equal([]);
    expect(commands).to.include('kubectl apply -k ./manifests/mongodb -n default');
    expect(commands.some((command) => command.includes('mongosh'))).to.equal(true);
  });

  it('wipes them only on an explicit reset', async () => {
    await restore({ reset: true });
    expect(commands).to.include('kubectl delete pvc mongodb-storage-mongodb-0 -n default --ignore-not-found');
    expect(commands).to.include('sudo rm -rf /data/mongodb/v0');
  });
});
