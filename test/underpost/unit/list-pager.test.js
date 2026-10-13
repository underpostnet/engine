'use strict';

import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * A list pager keeps its page in memory: one view pages several lists, each read asks for one page,
 * and the Previous and Next buttons stop at the ends.
 */

const template = (strings, ...values) => strings.reduce((out, text, i) => out + text + (values[i] ?? ''), '');
globalThis.html = template;

const dom = vi.hoisted(() => ({ nodes: {}, html: {} }));

vi.mock('../../../src/client/components/core/VanillaJs.js', () => ({
  s: (selector) => dom.nodes[selector],
  htmls: (selector, markup) => {
    dom.html[selector] = markup;
  },
}));
vi.mock('../../../src/client/components/core/BtnIcon.js', () => ({
  BtnIcon: { instance: async ({ class: className, label }) => `<button class="${className}">${label}</button>` },
}));
vi.mock('../../../src/client/components/core/Translate.js', () => ({ Translate: { instance: (key) => key } }));

const { ListPager } = await import('../../../src/client/components/core/ListPager.js');

// A list of `total` numbered rows, read one page at a time.
const rowsOf = (total) => Array.from({ length: total }, (_, i) => i + 1);
const pagerOver = async (id, rows, limit = 10) => {
  const fetch = vi.fn(async ({ page, limit }) => ({
    data: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
  }));
  const render = vi.fn();
  const markup = await ListPager.instance({ id, fetch, render, limit, unit: 'rows' });
  for (const action of ['prev', 'next']) dom.nodes[`.list-pager-${id}-${action}`] = { style: {} };
  return { fetch, render, markup };
};

describe('a list pager', () => {
  beforeEach(() => {
    dom.nodes = {};
    dom.html = {};
  });

  it('renders Previous, the page info and Next for its own list', async () => {
    const { markup } = await pagerOver('quests', rowsOf(3));
    expect(markup).toContain('list-pager-quests-prev');
    expect(markup).toContain('list-pager-quests-info');
    expect(markup).toContain('list-pager-quests-next');
    expect(markup).toContain('aria-live="polite"');
  });

  it('reads one page, shows its rows and where it stands with the total', async () => {
    const { fetch, render } = await pagerOver('quests', rowsOf(23));

    await ListPager.load('quests', 2);

    expect(fetch).toHaveBeenCalledWith({ page: 2, limit: 10 });
    expect(render).toHaveBeenCalledWith(rowsOf(20).slice(10));
    expect(dom.html['.list-pager-quests-info']).toBe('2 / 3 (23 rows)');
  });

  it('turns pages with its buttons and stops at the ends', async () => {
    const { render } = await pagerOver('quests', rowsOf(23));
    const prev = dom.nodes['.list-pager-quests-prev'];
    const next = dom.nodes['.list-pager-quests-next'];

    await ListPager.load('quests', 1);
    expect([prev.disabled, next.disabled]).toEqual([true, false]);
    await next.onclick();
    await next.onclick();
    expect(render).toHaveBeenLastCalledWith([21, 22, 23]);
    expect([prev.disabled, next.disabled]).toEqual([false, true]);
    expect(next.style.cursor).toBe('not-allowed');
  });

  it('keeps the page of each list apart', async () => {
    await pagerOver('quests', rowsOf(30));
    const actions = await pagerOver('actions', rowsOf(30));

    await ListPager.load('quests', 3);
    await ListPager.load('actions', 1);
    await ListPager.load('quests');

    expect(dom.html['.list-pager-quests-info']).toBe('3 / 3 (30 rows)');
    expect(actions.render).toHaveBeenCalledTimes(1);
  });

  it('shows the last page when the shown one no longer exists', async () => {
    const rows = rowsOf(21);
    const { render } = await pagerOver('quests', rows);
    await ListPager.load('quests', 3);

    rows.pop();
    await ListPager.load('quests');

    expect(dom.html['.list-pager-quests-info']).toBe('2 / 2 (20 rows)');
    expect(render).toHaveBeenLastCalledWith(rowsOf(20).slice(10));
  });

  it('shows only the newest of two reads that overlap', async () => {
    let release;
    const slow = new Promise((resolve) => (release = resolve));
    const render = vi.fn();
    await ListPager.instance({
      id: 'slow',
      fetch: ({ page }) => (page === 1 ? slow.then(() => ({ data: ['old'], total: 2 })) : { data: ['new'], total: 2 }),
      render,
      limit: 1,
    });

    const first = ListPager.load('slow', 1);
    await ListPager.load('slow', 2);
    release();
    await first;

    expect(render.mock.calls).toEqual([[['new']]]);
  });

  it('reads its first page again once the typing in a search box pauses', async () => {
    vi.useFakeTimers();
    const { fetch } = await pagerOver('quests', rowsOf(30));
    let onInput;
    ListPager.search('quests', { addEventListener: (event, handler) => (onInput = handler) });

    onInput();
    onInput();
    await vi.runAllTimersAsync();

    expect(fetch.mock.calls).toEqual([[{ page: 1, limit: 10 }]]);
    vi.useRealTimers();
  });
});
