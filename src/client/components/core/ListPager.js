/**
 * Previous / Next pagination that keeps its page in memory, not in the query parameters, so one view
 * can page several lists. A read returns one page, so the view holds one page at a time.
 *
 * A read pages by number and returns the total, or pages by cursor: it returns `next`, the cursor of
 * the page after it ('' on the last page), and gets the cursor of the page it reads as `after`.
 *
 * @module src/client/components/core/ListPager.js
 */
import { BtnIcon } from './BtnIcon.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';

const SEARCH_DELAY_MS = 250;

class ListPager {
  static Tokens = {};

  /**
   * Renders the pager of a list. Call {@link ListPager.load} once the markup is in the page.
   * @param {Object} options
   * @param {string} options.id
   * @param {(query:{page:number,limit:number,after:string})=>Promise<{data:Object[],total?:number,next?:string}|null>} options.fetch
   *   Reads one page; null when the read failed.
   * @param {(rows:Object[])=>void|Promise<void>} options.render - Shows the rows of the page.
   * @param {number} [options.limit] - Rows on one page.
   * @param {string} [options.unit] - What the total counts, e.g. "files".
   * @returns {Promise<string>}
   */
  static async instance({ id, fetch, render, limit = 10, unit = '' }) {
    ListPager.Tokens[id] = { page: 1, read: 0, fetch, render, limit, unit, cursors: [''] };
    const column = 'width: 33.33%;';
    return html`<div class="fl list-pager list-pager-${id}" style="padding: 5px 0;">
      <div class="in fll" style="${column}">
        ${await BtnIcon.instance({
          class: `in wfa list-pager-${id}-prev`,
          label: html`<i class="fa-solid fa-chevron-left"></i> ${Translate.instance('previous')}`,
          type: 'button',
        })}
      </div>
      <div class="in fll" style="${column} text-align: center;">
        <span class="list-pager-${id}-info" style="display: inline-block; padding: 8px 0;" aria-live="polite"></span>
      </div>
      <div class="in fll" style="${column}">
        ${await BtnIcon.instance({
          class: `in wfa list-pager-${id}-next`,
          label: html`${Translate.instance('next')} <i class="fa-solid fa-chevron-right"></i>`,
          type: 'button',
        })}
      </div>
    </div>`;
  }

  /** Reads and shows page `page` of a list, its current page by default; a page past the end shows the last. */
  static async load(id, page = ListPager.Tokens[id]?.page) {
    const pager = ListPager.Tokens[id];
    if (!pager) return;
    const read = ++pager.read;
    if (page === 1) pager.cursors = [''];
    const result = await pager.fetch({ page, limit: pager.limit, after: pager.cursors[page - 1] ?? '' });
    if (!result || ListPager.Tokens[id] !== pager || read !== pager.read) return;
    const cursor = typeof result.next === 'string';
    if (cursor) pager.cursors[page] = result.next;
    const pages = cursor ? (result.next ? page + 1 : page) : Math.max(1, Math.ceil(result.total / pager.limit));
    if (page > pages) return ListPager.load(id, pages);
    pager.page = page;
    await pager.render(result.data);
    if (ListPager.Tokens[id] !== pager || read !== pager.read) return;
    const unit = pager.unit ? ` ${pager.unit}` : '';
    htmls(
      `.list-pager-${id}-info`,
      cursor
        ? `${page}${result.next ? '' : ' / ' + page} (${result.data.length}${unit})`
        : `${page} / ${pages} (${result.total}${unit})`,
    );
    for (const [action, step, off] of [
      ['prev', -1, page <= 1],
      ['next', 1, page >= pages],
    ]) {
      const button = s(`.list-pager-${id}-${action}`);
      if (!button) continue;
      button.disabled = off;
      button.style.opacity = off ? '0.5' : '';
      button.style.cursor = off ? 'not-allowed' : '';
      button.onclick = () => ListPager.load(id, page + step);
    }
  }

  static dispose(id, pager) {
    if (ListPager.Tokens[id] === pager) delete ListPager.Tokens[id];
  }

  /** Reads a list again from its first page each time the text of `input` changes and the typing pauses. */
  static search(id, input) {
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => ListPager.load(id, 1), SEARCH_DELAY_MS);
    });
  }
}

export { ListPager };
