import { describe, expect, it } from 'vitest';
import { transformClientJs } from '../../../src/client-builder/client-formatted.js';

describe('Cyberia browser defaults', () => {
  it.each([
    { proxyPath: '/', baseHost: '', minify: false },
    { proxyPath: '/portal', baseHost: '', minify: false },
    { proxyPath: '/', baseHost: 'https://www.cyberiaonline.com', minify: true },
  ])('loads published defaults without server dependencies: %j', async (options) => {
    const source = await transformClientJs('src/client/components/cyberia/SharedDefaultsCyberia.js', options);
    const defaults = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

    expect(defaults.DEFAULT_INSTANCE_CODE).toBeTruthy();
    expect(defaults.STAT_TYPES.length).toBeGreaterThan(0);
    expect(defaults.worldPathOf(defaults.DEFAULT_INSTANCE_CODE)).toBe('');
  });
});
