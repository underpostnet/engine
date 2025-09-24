import { getQueryParams, setQueryParams } from './Router.js';

class AgPagination extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._gridId = null;
    const queryParams = getQueryParams();
    this._currentPage = parseInt(queryParams.page, 10) || 1;
    this._limit = parseInt(queryParams.limit, 10) || 10;
    this._totalPages = 1;
    this._totalItems = 0;
    this.handlePageChange = this.handlePageChange.bind(this);
    this.handleLimitChange = this.handleLimitChange.bind(this);
  }

  static get observedAttributes() {
    return ['grid-id', 'current-page', 'total-pages', 'total-items', 'limit'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'grid-id':
        this._gridId = newValue;
        break;
      case 'current-page':
        this._currentPage = parseInt(newValue, 10) || this._currentPage;
        break;
      case 'total-pages':
        this._totalPages = parseInt(newValue, 10) || 1;
        break;
      case 'total-items':
        this._totalItems = parseInt(newValue, 10) || 0;
        break;
      case 'limit':
        this._limit = parseInt(newValue, 10) || this._limit;
        break;
    }
    this.update();
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
    this.update();
  }

  disconnectedCallback() {
    // Event listeners on shadow DOM are garbage collected with the component
  }

  handlePageChange(newPage) {
    if (newPage < 1 || newPage > this._totalPages || newPage === this._currentPage) {
      return;
    }
    this._currentPage = newPage;
    setQueryParams({ page: newPage, limit: this._limit });
    this.dispatchEvent(new CustomEvent('page-change', { detail: { page: newPage } }));
  }

  handleLimitChange(event) {
    const newLimit = parseInt(event.target.value, 10);
    if (newLimit === this._limit) {
      return;
    }
    this._limit = newLimit;
    this._currentPage = 1; // Reset to first page on limit change
    setQueryParams({ page: 1, limit: newLimit });
    this.dispatchEvent(new CustomEvent('limit-change', { detail: { limit: newLimit } }));
  }

  update() {
    if (!this.shadowRoot.querySelector('#page-info')) return;

    const isFirstPage = this._currentPage === 1;
    const isLastPage = this._currentPage === this._totalPages;

    this.shadowRoot.querySelector('#first-page').disabled = isFirstPage;
    this.shadowRoot.querySelector('#prev-page').disabled = isFirstPage;
    this.shadowRoot.querySelector('#next-page').disabled = isLastPage;
    this.shadowRoot.querySelector('#last-page').disabled = isLastPage;

    const startItem = this._totalItems > 0 ? (this._currentPage - 1) * this._limit + 1 : 0;
    const endItem = Math.min(this._currentPage * this._limit, this._totalItems);

    this.shadowRoot.querySelector('#summary-info').textContent = `${startItem} - ${endItem} of ${this._totalItems}`;
    this.shadowRoot.querySelector('#page-info').textContent = `Page ${this._currentPage} of ${this._totalPages}`;

    const limitSelector = this.shadowRoot.querySelector('#limit-selector');
    if (limitSelector.value != this._limit) {
      limitSelector.value = this._limit;
    }

    this.renderPageButtons();
  }

  renderPageButtons() {
    const pageButtonsContainer = this.shadowRoot.querySelector('#page-buttons');
    pageButtonsContainer.innerHTML = '';

    const maxButtons = 5;
    let startPage = Math.max(1, this._currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(this._totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      const button = document.createElement('button');
      button.textContent = i;
      button.disabled = i === this._currentPage;
      if (i === this._currentPage) {
        button.classList.add('active');
      }
      button.addEventListener('click', () => this.handlePageChange(i));
      pageButtonsContainer.appendChild(button);
    }
  }

  addEventListeners() {
    this.shadowRoot.querySelector('#first-page').addEventListener('click', () => this.handlePageChange(1));
    this.shadowRoot
      .querySelector('#prev-page')
      .addEventListener('click', () => this.handlePageChange(this._currentPage - 1));
    this.shadowRoot
      .querySelector('#next-page')
      .addEventListener('click', () => this.handlePageChange(this._currentPage + 1));
    this.shadowRoot
      .querySelector('#last-page')
      .addEventListener('click', () => this.handlePageChange(this._totalPages));
    this.shadowRoot.querySelector('#limit-selector').addEventListener('change', this.handleLimitChange);
  }

  render() {
    this.shadowRoot.innerHTML = html`
      <style>
        :host {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          font-family: sans-serif;
          font-size: 14px;
          gap: 8px;
        }
        button {
          border: 1px solid #ccc;
          background-color: #f0f0f0;
          padding: 6px 12px;
          cursor: pointer;
          border-radius: 4px;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        button.active {
          border-color: #007bff;
          background-color: #007bff;
          color: white;
        }
        #page-info {
          min-width: 80px;
          text-align: center;
        }
        #page-buttons {
          display: flex;
          gap: 4px;
        }
        .summary-panel,
        .page-summary-panel {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #limit-selector {
          border: 1px solid #ccc;
          background-color: #f0f0f0;
          padding: 6px 12px;
          border-radius: 4px;
        }
      </style>
      <div class="summary-panel">
        <span id="summary-info"></span>
      </div>
      <button id="first-page">First</button>
      <button id="prev-page">Previous</button>
      <div class="page-summary-panel">
        <div id="page-buttons"></div>
        <span id="page-info"></span>
      </div>
      <button id="next-page">Next</button>
      <button id="last-page">Last</button>
      <select id="limit-selector">
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    `;
  }
}

customElements.define('ag-pagination', AgPagination);

export { AgPagination };
