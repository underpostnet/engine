import { describe, expect, it } from 'vitest';
import { ssrFactory } from '../../../src/client-builder/ssr.js';

const seo = async (props = {}) =>
  (await ssrFactory('./src/client/ssr/head/Seo.js'))({
    title: 'Log in',
    author: 'https://example.test',
    keywords: ['game'],
    description: 'A view.',
    themeColor: '#000000',
    ssrPath: '/',
    canonicalURL: 'https://app.example.test/log-in/',
    thumbnail: 'https://app.example.test/preview.png',
    ...props,
  });

describe('the SEO head of a view', () => {
  it('names the canonical URL of the view', async () => {
    const head = await seo();
    expect(head).toContain('<link rel="canonical" href="https://app.example.test/log-in/" />');
    expect(head).toContain('<meta property="og:url" content="https://app.example.test/log-in/" />');
  });

  it('keeps a view out of search only when the view asks for it', async () => {
    expect(await seo({ noindex: true })).toContain('<meta name="robots" content="noindex" />');
    expect(await seo()).not.toContain('name="robots"');
  });
});
