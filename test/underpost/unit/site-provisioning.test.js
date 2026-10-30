'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import Underpost from '../../../src/index.js';
import { DefaultConf } from '../../../underpost.config.js';

// Site operations read and write paths relative to the engine root, so every case runs in a fixture tree.
describe('site provisioning', () => {
  const cwd = process.cwd();
  const FAVICON = Buffer.from([0, 1, 2, 255]);
  let root;
  let defaultConf;

  const write = (relative, content) =>
    fs.outputFileSync(
      path.join(root, relative),
      typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content, null, 4),
    );
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const readJson = (relative) => JSON.parse(read(relative));
  const exists = (relative) => fs.existsSync(path.join(root, relative));
  const snapshot = () =>
    Object.fromEntries(
      fs
        .readdirSync(root, { recursive: true })
        .map((entry) => `${entry}`)
        .filter((entry) => fs.statSync(path.join(root, entry)).isFile())
        .map((entry) => [entry, read(entry)]),
    );

  const shopRoute = {
    client: 'shop',
    runtime: 'nodejs',
    apis: ['user'],
    proxy: [80, 443],
    db: { provider: 'mongoose', name: 'env:DB_NAME_SHOP' },
  };

  const fixture = () => {
    write('engine-private/deploy/dd.routes', 'dd-shop,dd-blog');
    write('engine-private/conf/dd-shop/conf.server.json', {
      'www.shop.net': { '/': shopRoute, '/admin': { ...shopRoute, replicas: ['/admin'], singleReplica: true } },
      'shop.net': { '/': { client: null, runtime: 'nodejs', apis: [], redirect: 'https://www.shop.net' } },
    });
    write('engine-private/conf/dd-shop/conf.server.dev.shop.json', { 'www.shop.net': { '/': shopRoute } });
    write('engine-private/conf/dd-shop/conf.client.json', {
      shop: {
        metadata: { title: 'Shop' },
        components: { core: ['Css'], shop: ['AppShellShop'] },
        services: ['user', 'shop'],
      },
    });
    write('engine-private/conf/dd-shop/conf.ssr.json', {
      Shop: {
        head: ['Seo', 'PwaShop', 'ShopScripts'],
        body: ['ShopSplashScreen', '404'],
        mailer: { userVerifyEmail: 'ShopVerifyEmail' },
        views: [{ path: '/offline', client: 'Shop', offlineDefault: true }],
      },
    });
    write('engine-private/conf/dd-shop/.env.production', 'JWT_SECRET=s3cret\nDB_NAME_SHOP=shop\n');
    write('engine-private/replica/dd-shop-admin/conf.server.json', { 'www.shop.net': { '/admin': shopRoute } });
    write('engine-private/replica/dd-shop-admin/conf.client.json', {
      shop: { components: { core: ['Css'] }, services: ['user'] },
    });
    write('engine-private/conf/dd-blog/conf.server.json', {});
    write('engine-private/conf/dd-blog/conf.client.json', {
      blog: { components: { core: ['Css'] }, services: ['user'] },
    });
    write('engine-private/conf/dd-blog/conf.ssr.json', {});
    write('engine-private/conf/dd-blog/.env.production', 'JWT_SECRET=blog-secret\n');

    write(
      'src/client/components/shop/AppShellShop.js',
      [
        "import { Css } from '../core/Css.js';",
        "import { ShopService } from '../../services/shop/shop.service.js';",
        "const shopTheme = 'shop';",
        'class AppShellShop {}',
        'export default AppShellShop;',
        '',
      ].join('\n'),
    );
    write('src/client/components/core/Css.js', 'export const Css = {};\n');
    write('src/client/components/core/Chart.js', 'export const Chart = {};\n');
    write('src/client/services/shop/shop.service.js', "const endpoint = 'shop';\nexport class ShopService {}\n");
    write('src/client/public/shop/favicon.ico', FAVICON);
    write('src/client/Shop.index.js', "import AppShellShop from './components/shop/AppShellShop.js';\n");
    for (const [kind, name] of [
      ['head', 'Seo'],
      ['head', 'PwaShop'],
      ['head', 'ShopScripts'],
      ['body', 'ShopSplashScreen'],
      ['body', '404'],
      ['mailer', 'ShopVerifyEmail'],
    ])
      write(`src/client/ssr/${kind}/${name}.js`, `// ${name}\n`);
    write('src/api/order/order.router.js', '// order\n');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-site-'));
    process.chdir(root);
    fixture();
    defaultConf = vi.spyOn(Underpost.repo, 'updateDefaultConf').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    fs.removeSync(root);
  });

  describe('create', () => {
    const create = (options = {}) =>
      Underpost.site.create('WWW.Example.COM', {
        client: 'example',
        deployId: 'dd-blog',
        from: 'shop',
        fromDeployId: 'dd-shop',
        ...options,
      });

    it('creates the client, the primary route, the redirect route and the database variable', () => {
      expect(create().applied).to.equal(true);

      const entry = { ...shopRoute, client: 'example', db: { provider: 'mongoose', name: 'env:DB_NAME_EXAMPLE' } };
      expect(readJson('engine-private/conf/dd-blog/conf.server.json')).to.deep.equal({
        'www.example.com': { '/': entry },
        'example.com': {
          '/': {
            client: null,
            runtime: 'nodejs',
            apis: [],
            origins: [],
            proxy: [80, 443],
            redirect: 'https://www.example.com',
          },
        },
      });
      expect(readJson('engine-private/conf/dd-blog/conf.server.dev.example.json')).to.deep.equal({
        'www.example.com': { '/': entry },
      });
      expect(read('engine-private/conf/dd-blog/.env.production')).to.equal(
        'JWT_SECRET=blog-secret\nDB_NAME_EXAMPLE=example\n',
      );
      expect(readJson('engine-private/conf/dd-blog/conf.client.json').example).to.deep.equal({
        metadata: { title: 'Shop' },
        components: { core: ['Css'], example: ['AppShellExample'] },
        services: ['user', 'shop'],
      });
      expect(readJson('engine-private/conf/dd-blog/conf.ssr.json').Example).to.deep.equal({
        head: ['Seo', 'PwaExample', 'ExampleScripts'],
        body: ['ExampleSplashScreen', '404'],
        mailer: { userVerifyEmail: 'ExampleVerifyEmail' },
        views: [{ path: '/offline', client: 'Example', offlineDefault: true }],
      });
      expect(defaultConf).toHaveBeenCalledWith({ deployId: 'dd-blog' });
    });

    it('renames only the semantic references of the client sources and copies assets byte for byte', () => {
      create();
      expect(read('src/client/components/example/AppShellExample.js')).to.equal(
        [
          "import { Css } from '../core/Css.js';",
          "import { ExampleService } from '../../services/example/example.service.js';",
          "const shopTheme = 'example';",
          'class AppShellExample {}',
          'export default AppShellExample;',
          '',
        ].join('\n'),
      );
      expect(read('src/client/services/example/example.service.js')).to.equal(
        "const endpoint = 'example';\nexport class ExampleService {}\n",
      );
      expect(read('src/client/Example.index.js')).to.equal(
        "import AppShellExample from './components/example/AppShellExample.js';\n",
      );
      for (const name of [
        'head/PwaExample',
        'head/ExampleScripts',
        'body/ExampleSplashScreen',
        'mailer/ExampleVerifyEmail',
      ])
        expect(exists(`src/client/ssr/${name}.js`), name).to.equal(true);
      expect(fs.readFileSync(path.join(root, 'src/client/public/example/favicon.ico')).equals(FAVICON)).to.equal(true);
      expect(read('src/client/components/shop/AppShellShop.js')).to.include('class AppShellShop {}');
    });

    it('plans nothing on a second run', () => {
      create();
      defaultConf.mockClear();
      const { applied, plan } = create();
      expect(applied).to.equal(false);
      expect(plan.every(({ action }) => action === 'unchanged')).to.equal(true);
      expect(defaultConf).not.toHaveBeenCalled();
    });

    it('writes nothing on a dry run', () => {
      const before = snapshot();
      const { applied, plan } = create({ dryRun: true });
      expect(applied).to.equal(false);
      expect(plan.some(({ path: file }) => file === 'src/client/components/example/AppShellExample.js')).to.equal(true);
      expect(snapshot()).to.deep.equal(before);
      expect(defaultConf).not.toHaveBeenCalled();
    });

    it('refuses a route conflict before writing any file, and replaces it when asked', () => {
      write('engine-private/conf/dd-blog/conf.server.json', { 'www.example.com': { '/': { client: 'blog' } } });
      const before = snapshot();
      expect(() => create()).to.throw('Route conflict: www.example.com/');
      expect(snapshot()).to.deep.equal(before);

      create({ replace: true });
      expect(readJson('engine-private/conf/dd-blog/conf.server.json')['www.example.com']['/'].client).to.equal(
        'example',
      );
    });

    it('refuses a clone whose references do not resolve', () => {
      write('src/client/components/shop/Broken.js', "import { Gone } from '../missing/Gone.js';\n");
      const before = snapshot();
      expect(() => create()).to.throw('Unresolved client references');
      expect(snapshot()).to.deep.equal(before);
    });

    it('rejects an invalid hostname, path, client id and an unknown deployment', () => {
      expect(() => create({ path: '/a/../b' })).to.throw('Invalid route path');
      expect(() => create({ client: 'Bad_Id' })).to.throw('Invalid client id');
      expect(() => create({ deployId: 'dd-missing' })).to.throw('Deploy configuration not found');
      expect(() => Underpost.site.create('bad_host', { client: 'x', deployId: 'dd-blog' })).to.throw(
        'Invalid hostname',
      );
    });

    it('normalizes an internationalized hostname', () => {
      create({ dryRun: true });
      const { plan } = Underpost.site.create('münchen.de', {
        client: 'example',
        deployId: 'dd-blog',
        from: 'shop',
        fromDeployId: 'dd-shop',
        dryRun: true,
      });
      expect(plan.find(({ path: file }) => file.endsWith('dd-blog/conf.server.json')).summary).to.equal(
        'add route www.xn--mnchen-3ya.de/; add route xn--mnchen-3ya.de/',
      );
    });
  });

  it('plans a site from the default template against the real client sources', () => {
    process.chdir(cwd);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'underpost-site-template-'));
    try {
      fs.symlinkSync(path.join(cwd, 'src'), path.join(scratch, 'src'));
      for (const type of ['server', 'client', 'ssr'])
        fs.outputJsonSync(path.join(scratch, `engine-private/conf/dd-site/conf.${type}.json`), {});
      process.chdir(scratch);
      // A sliced repository carries its own deploy conf as the default template.
      const from = Object.values(DefaultConf.server)
        .flatMap((routes) => Object.values(routes))
        .find((route) => route.client).client;
      const { applied, plan } = Underpost.site.create('example.com', {
        client: 'example',
        deployId: 'dd-site',
        from,
        dryRun: true,
      });
      expect(applied).to.equal(false);
      const files = plan.map(({ path: file }) => file);
      expect(files).to.include('src/client/components/example/AppShellExample.js');
      expect(files).to.include('src/client/Example.index.js');
      expect(fs.existsSync(path.join(cwd, 'src/client/components/example'))).to.equal(false);
    } finally {
      process.chdir(root);
      fs.removeSync(scratch);
    }
  });

  describe('clone-client', () => {
    it('clones the client and adds a sibling route next to each route of the source client', () => {
      Underpost.site.cloneClient('shop', 'outlet', { deployId: 'dd-shop' });
      const entry = { ...shopRoute, client: 'outlet', db: { provider: 'mongoose', name: 'env:DB_NAME_OUTLET' } };
      const server = readJson('engine-private/conf/dd-shop/conf.server.json');
      expect(server['www.shop.net']['/outlet']).to.deep.equal(entry);
      expect(server['www.shop.net']['/admin/outlet'].client).to.equal('outlet');
      expect(
        readJson('engine-private/conf/dd-shop/conf.server.dev.shop.json')['www.shop.net']['/outlet'],
      ).to.deep.equal(entry);
      expect(readJson('engine-private/conf/dd-shop/conf.client.json').outlet.components.outlet).to.deep.equal([
        'AppShellOutlet',
      ]);
      expect(read('engine-private/conf/dd-shop/.env.production')).to.equal(
        'JWT_SECRET=s3cret\nDB_NAME_SHOP=shop\nDB_NAME_OUTLET=outlet\n',
      );
    });

    it('refuses a target client that exists with other content', () => {
      write('src/client/components/outlet/AppShellOutlet.js', '// edited\n');
      expect(() => Underpost.site.cloneClient('shop', 'outlet', { deployId: 'dd-shop' })).to.throw('Client conflict');
    });
  });

  describe('clone-route', () => {
    it('clones a route with its development variants to another deployment and client', () => {
      Underpost.site.cloneRoute('www.shop.net', 'www.store.net/app', {
        deployId: 'dd-blog',
        fromDeployId: 'dd-shop',
        client: 'store',
      });
      const entry = { ...shopRoute, client: 'store', db: { provider: 'mongoose', name: 'env:DB_NAME_STORE' } };
      expect(readJson('engine-private/conf/dd-blog/conf.server.json')).to.deep.equal({
        'www.store.net': { '/app': entry },
      });
      expect(readJson('engine-private/conf/dd-blog/conf.server.dev.shop.json')).to.deep.equal({
        'www.store.net': { '/app': entry },
      });
      expect(readJson('engine-private/conf/dd-blog/conf.server.dev.store.json')).to.deep.equal({
        'www.store.net': { '/app': entry },
      });
      expect(read('engine-private/conf/dd-blog/.env.production')).to.equal(
        'JWT_SECRET=blog-secret\nDB_NAME_STORE=store\n',
      );
    });

    it('refuses a missing source route and a route cloned onto itself', () => {
      expect(() => Underpost.site.cloneRoute('www.none.net', 'www.x.net', { deployId: 'dd-shop' })).to.throw(
        'Route not found',
      );
      expect(() => Underpost.site.cloneRoute('www.shop.net/', 'www.shop.net', { deployId: 'dd-shop' })).to.throw(
        'Source and target routes are the same',
      );
    });
  });

  describe('add-api', () => {
    it('registers the API on the routes that serve APIs, the variants, the replicas and the client', () => {
      Underpost.site.addApi('order', { deployId: 'dd-shop', client: 'shop' });
      const server = readJson('engine-private/conf/dd-shop/conf.server.json');
      expect(server['www.shop.net']['/'].apis).to.deep.equal(['user', 'order']);
      expect(server['www.shop.net']['/admin'].apis).to.deep.equal(['user', 'order']);
      expect(server['shop.net']['/'].apis).to.deep.equal([]);
      expect(readJson('engine-private/conf/dd-shop/conf.server.dev.shop.json')['www.shop.net']['/'].apis).to.deep.equal(
        ['user', 'order'],
      );
      expect(
        readJson('engine-private/replica/dd-shop-admin/conf.server.json')['www.shop.net']['/admin'].apis,
      ).to.deep.equal(['user', 'order']);
      expect(readJson('engine-private/conf/dd-shop/conf.client.json').shop.services).to.deep.equal([
        'user',
        'shop',
        'order',
      ]);
      expect(readJson('engine-private/replica/dd-shop-admin/conf.client.json').shop.services).to.deep.equal([
        'user',
        'order',
      ]);
      expect(Underpost.site.addApi('order', { deployId: 'dd-shop', client: 'shop' }).applied).to.equal(false);
    });

    it('refuses an unknown API, an unknown host and a deployment without API routes', () => {
      expect(() => Underpost.site.addApi('ghost', { deployId: 'dd-shop' })).to.throw('API not found');
      expect(() => Underpost.site.addApi('order', { deployId: 'dd-shop', host: 'none.net' })).to.throw(
        'Host not found',
      );
      expect(() => Underpost.site.addApi('order', { deployId: 'dd-blog' })).to.throw('No route of dd-blog serves APIs');
    });
  });

  describe('add-component', () => {
    it('requires one explicit scope', () => {
      expect(() => Underpost.site.addComponent('Chart', {})).to.throw('Name exactly one scope');
      expect(() => Underpost.site.addComponent('Chart', { deployId: 'dd-shop', allDeploys: true })).to.throw(
        'Name exactly one scope',
      );
    });

    it('adds the component to the lists whose submodule has its file, in the replicas too', () => {
      Underpost.site.addComponent('Chart', { deployId: 'dd-shop' });
      expect(readJson('engine-private/conf/dd-shop/conf.client.json').shop.components).to.deep.equal({
        core: ['Css', 'Chart'],
        shop: ['AppShellShop'],
      });
      expect(readJson('engine-private/replica/dd-shop-admin/conf.client.json').shop.components.core).to.deep.equal([
        'Css',
        'Chart',
      ]);
      expect(readJson('engine-private/conf/dd-blog/conf.client.json').blog.components.core).to.deep.equal(['Css']);
    });

    it('reaches every routed deployment with --all-deploys', () => {
      Underpost.site.addComponent('Chart', { allDeploys: true, submodule: 'core' });
      expect(readJson('engine-private/conf/dd-blog/conf.client.json').blog.components.core).to.deep.equal([
        'Css',
        'Chart',
      ]);
      expect(defaultConf.mock.calls).to.deep.equal([[{ deployId: 'dd-shop' }], [{ deployId: 'dd-blog' }]]);
    });

    it('refuses a component without a source file', () => {
      expect(() => Underpost.site.addComponent('Ghost', { deployId: 'dd-shop' })).to.throw('Component file not found');
    });
  });

  describe('new api and new ws', () => {
    beforeEach(() => {
      for (const type of ['model', 'controller', 'service', 'router'])
        write(`src/api/default/default.${type}.js`, `// Default ${type} of default\n`);
      write('src/client/services/default/default.service.js', 'const DefaultService = {};\n');
      write('src/ws/default/default.ws.server.js', "export const DefaultWsServer = 'default';\n");
    });

    it('generates an API from the template and registers it in the deployment', async () => {
      await Underpost.repo.newApi('invoice', { deployId: 'dd-shop', client: 'shop' });
      expect(read('src/api/invoice/invoice.router.js')).to.equal('// Invoice router of invoice\n');
      expect(read('src/client/services/invoice/invoice.service.js')).to.equal('const InvoiceService = {};\n');
      expect(readJson('engine-private/conf/dd-shop/conf.client.json').shop.services).to.include('invoice');
      await expect(Underpost.repo.newApi('invoice', {})).rejects.toThrow('API already exists');
    });

    it('validates the routes of a WebSocket server before it generates the sources', async () => {
      await expect(
        Underpost.repo.newWs('chat', { deployId: 'dd-shop', host: 'www.shop.net', paths: '/missing' }),
      ).rejects.toThrow('Route not found: www.shop.net/missing');
      expect(exists('src/ws/chat')).to.equal(false);

      await Underpost.repo.newWs('chat', { deployId: 'dd-shop', host: 'www.shop.net', paths: '/,/admin' });
      expect(read('src/ws/chat/chat.ws.server.js')).to.equal("export const ChatWsServer = 'chat';\n");
      const server = readJson('engine-private/conf/dd-shop/conf.server.json')['www.shop.net'];
      expect([server['/'].ws, server['/admin'].ws]).to.deep.equal(['chat', 'chat']);
    });
  });
});
