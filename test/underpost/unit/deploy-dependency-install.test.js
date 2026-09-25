import { expect } from 'chai';

// The command, not its effect: running npm here would rewrite this checkout.
const commands = [];
vi.mock('../../../src/server/runtime/process.js', async (importOriginal) => ({
  ...(await importOriginal()),
  shellExec: (command) => commands.push(command),
}));

const { installDeployDependencies } = await import('../../../src/server/build/package.js');

describe('catalog dependency install', () => {
  beforeEach(() => {
    commands.length = 0;
  });

  it('installs the pins and keeps the dev dependencies a production environment would prune', async () => {
    const catalog = { packageDependencies: { jimp: '^1.6.0', pngjs: '^7.0.0' } };
    expect(await installDeployDependencies('dd-product', catalog)).to.deep.equal(['jimp@^1.6.0', 'pngjs@^7.0.0']);
    expect(commands).to.deep.equal(['npm install --include=dev jimp@^1.6.0 pngjs@^7.0.0']);
  });

  it('runs no install for a catalog without pins', async () => {
    expect(await installDeployDependencies('dd-product', { packageDependencies: {} })).to.deep.equal([]);
    expect(commands).to.be.empty;
  });
});
