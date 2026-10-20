import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs-extra';
import Underpost from '../../../src/index.js';

const confServer = { 'www.example.com': { '/': { grpc: { port: 50051 } } } };

describe('gRPC Service', () => {
  afterEach(() => vi.restoreAllMocks());

  const build = (traffic) => {
    const writes = [];
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => writes.push({ filePath, content }));
    const yamlPath = Underpost.deploy.buildGrpcServiceManifest({
      deployId: 'dd-x',
      env: 'production',
      confServer,
      traffic,
    });
    return { yamlPath, writes };
  };

  it('keeps one name for every colour, so a switch moves only the selector', () => {
    for (const traffic of ['blue', 'green']) {
      const { yamlPath, writes } = build(traffic);
      expect(yamlPath).to.equal('./engine-private/conf/dd-x/build/production/grpc-service.yaml');
      expect(writes).to.have.length(1);
      const names = [...writes[0].content.matchAll(/^ {2}name: (.+)$/gm)].map(([, name]) => name);
      expect(names).to.deep.equal(['dd-x-grpc-service-production']);
      expect(writes[0].content).to.contain(`selector:\n    app: dd-x-production-${traffic}\n`);
      vi.restoreAllMocks();
    }
  });

  it('names the Service an instance dials', () => {
    expect(Underpost.deploy.grpcServiceNameFactory({ deployId: 'dd-x', env: 'production' })).to.equal(
      'dd-x-grpc-service-production',
    );
  });

  it('writes nothing for a deploy without gRPC ports', () => {
    const writes = [];
    vi.spyOn(fs, 'writeFileSync').mockImplementation((filePath, content) => writes.push({ filePath, content }));
    const yamlPath = Underpost.deploy.buildGrpcServiceManifest({
      deployId: 'dd-x',
      env: 'production',
      confServer: { 'www.example.com': { '/': {} } },
      traffic: 'blue',
    });
    expect(yamlPath).to.equal(null);
    expect(writes).to.have.length(0);
  });
});
