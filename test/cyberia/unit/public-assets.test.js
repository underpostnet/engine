import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// The deploy pulls each public directory from one storage manifest. An asset that another manifest
// records under that directory is never pulled, and the build ships without it.
const SCRIPT = './deploy/dd-cyberia/sync-deploy.sh';
const CONF = './engine-private/conf/dd-cyberia';

const readKeys = (name) => Object.keys(JSON.parse(fs.readFileSync(`${CONF}/${name}`, 'utf8')));

const pulls = () => {
  const script = fs.readFileSync(SCRIPT, 'utf8');
  const dirs = Object.fromEntries(
    [...script.matchAll(/^([A-Z_]+)=(src\/client\/public\/\S+)$/gm)].map(([, name, dir]) => [name, dir]),
  );
  return [
    ...script.matchAll(/node bin fs \$([A-Z_]+) --deploy-id \$DEPLOY_ID --pull --tracked(?: --storage-id ([\w-]+))?"/g),
  ].map(([, name, id]) => ({ dir: dirs[name], manifest: id ? `storage.${id}.json` : 'storage.json' }));
};

describe.skipIf(!fs.existsSync(`${CONF}/storage.json`))('dd-cyberia public assets', () => {
  it('records every asset under a pulled directory in the manifest that pull reads', () => {
    const manifests = fs.readdirSync(CONF).filter((name) => /^storage(\.[\w-]+)?\.json$/.test(name));
    const misplaced = [];
    expect(pulls().map(({ dir }) => dir)).toEqual(['src/client/public/cyberia', 'src/client/public/underpost']);
    for (const { dir, manifest } of pulls()) {
      const pulled = new Set(readKeys(manifest));
      for (const other of manifests)
        for (const key of readKeys(other))
          if (key.startsWith(`${dir}/`) && !pulled.has(key)) misplaced.push(`${other}: ${key}`);
    }
    expect(misplaced).toEqual([]);
  });
});
