'use strict';

import { expect } from 'chai';

const router = vi.hoisted(() => ({
  currentRoute: true,
  queryParams: { page: '1', limit: '10' },
  isCurrentRoute: vi.fn(() => router.currentRoute),
  setQueryParams: vi.fn(),
  listenQueryParamsChange: vi.fn(),
  unlistenQueryParamsChange: vi.fn(),
}));

vi.mock('../../../src/client/components/core/Router.js', () => ({
  getQueryParams: () => router.queryParams,
  isCurrentRoute: router.isCurrentRoute,
  setQueryParams: router.setQueryParams,
  listenQueryParamsChange: router.listenQueryParamsChange,
  unlistenQueryParamsChange: router.unlistenQueryParamsChange,
}));

class HTMLElementStub extends EventTarget {
  attachShadow() {
    this.shadowRoot = { querySelector: () => null };
  }
}

globalThis.HTMLElement = HTMLElementStub;
globalThis.customElements = { define: vi.fn() };

const { AgPagination } = await import('../../../src/client/components/core/Pagination.js');

describe('pagination page validation', () => {
  beforeEach(() => {
    router.queryParams = { page: '1', limit: '10' };
    router.currentRoute = true;
    router.isCurrentRoute.mockClear();
    router.setQueryParams.mockReset();
    router.listenQueryParamsChange.mockReset();
    router.unlistenQueryParamsChange.mockReset();
  });

  it('keeps a page that exists', () => {
    router.queryParams.page = '3';
    const pagination = new AgPagination();

    pagination.attributeChangedCallback('total-pages', null, '3');

    expect(pagination._currentPage).to.equal(3);
    expect(router.setQueryParams).not.toHaveBeenCalled();
  });

  it('replaces an out-of-range page with the first page', () => {
    router.queryParams.page = '8';
    const pagination = new AgPagination();
    const changes = [];
    pagination.addEventListener('page-change', (event) => changes.push(event.detail));

    pagination.attributeChangedCallback('total-pages', null, '3');

    expect(pagination._currentPage).to.equal(1);
    expect(router.setQueryParams).toHaveBeenCalledWith({ page: 1, limit: 10 }, { replace: true });
    expect(changes).to.deep.equal([{ page: 1 }]);
  });

  it('does not let an inactive manager replace the current route page', () => {
    router.queryParams.page = '7';
    router.currentRoute = false;
    const pagination = new AgPagination();
    pagination.attributeChangedCallback('owner-route', null, 'cyberia-map-engine');

    pagination.attributeChangedCallback('total-pages', null, '1');

    expect(pagination._currentPage).to.equal(7);
    expect(router.isCurrentRoute).toHaveBeenCalledWith('cyberia-map-engine');
    expect(router.setQueryParams).not.toHaveBeenCalled();
  });

  it('waits for the current manager page count before validating a query change', () => {
    const pagination = new AgPagination();
    pagination.attributeChangedCallback('total-pages', null, '4');

    pagination.handleQueryParamsChange({ page: '8', limit: '10' });

    expect(pagination._currentPage).to.equal(8);
    expect(router.setQueryParams).not.toHaveBeenCalled();

    pagination.attributeChangedCallback('total-pages', '4', '4');

    expect(pagination._currentPage).to.equal(1);
    expect(router.setQueryParams).toHaveBeenCalledWith({ page: 1, limit: 10 }, { replace: true });
  });

  it('removes its grid listener when the manager closes', () => {
    const pagination = new AgPagination();
    pagination.id = 'ag-pagination-users-grid';
    pagination.render = vi.fn();
    pagination.addEventListeners = vi.fn();
    pagination.update = vi.fn();

    pagination.connectedCallback();
    pagination.disconnectedCallback();

    expect(router.listenQueryParamsChange).toHaveBeenCalledWith({
      id: 'ag-pagination-users-grid',
      event: pagination.handleQueryParamsChange,
    });
    expect(router.unlistenQueryParamsChange).toHaveBeenCalledWith(
      'ag-pagination-users-grid',
      pagination.handleQueryParamsChange,
    );
  });
});
