import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as protoLoader from '@grpc/proto-loader';

const SCHEMA = './src/grpc/cyberia/cyberia.proto';
const IMAGE = './src/runtime/engine-cyberia';

describe('the Cyberia gRPC schema', () => {
  it('lives in the engine that serves it', () => {
    const service = protoLoader.loadSync(SCHEMA)['cyberia.CyberiaDataService'];
    expect(Object.keys(service)).toContain('GetFullInstance');
  });

  it('builds the engine image without the cyberia-server repository', () => {
    const dockerfiles = fs.readdirSync(IMAGE).filter((name) => name.startsWith('Dockerfile'));
    expect(dockerfiles).toContain('Dockerfile');
    for (const name of dockerfiles)
      expect(fs.readFileSync(`${IMAGE}/${name}`, 'utf8'), name).not.toMatch(/clone\s+\S*cyberia-server/);
  });
});
