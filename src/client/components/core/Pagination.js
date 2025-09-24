class AgPagination extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._gridId = null;
    this._gridApi = null;
    this._currentPage = 1;
    this._totalPages = 1;
    this._totalItems = 0;
    this.handlePageChange = this.handlePageChange.bind(this);
  }

  static get observedAttributes() {
    return ['grid-id', 'current-page', 'total-pages', 'total-items'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'grid-id':
        this._gridId = newValue;
        break;
      case 'current-page':
        this._currentPage = parseInt(newValue, 10) || 1;
        break;
      case 'total-pages':
        this._totalPages = parseInt(newValue, 10) || 1;
        break;
      case 'total-items':
        this._totalItems = parseInt(newValue, 10) || 0;
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
    this.dispatchEvent(new CustomEvent('page-change', { detail: { page: newPage } }));
  }

  update() {
    if (!this.shadowRoot.querySelector('#page-info')) return;

    const isFirstPage = this._currentPage === 1;
    const isLastPage = this._currentPage === this._totalPages;

    this.shadowRoot.querySelector('#first-page').disabled = isFirstPage;
    this.shadowRoot.querySelector('#prev-page').disabled = isFirstPage;
    this.shadowRoot.querySelector('#next-page').disabled = isLastPage;
    this.shadowRoot.querySelector('#last-page').disabled = isLastPage;

    this.shadowRoot.querySelector(
      '#page-info',
    ).textContent = `Page ${this._currentPage} of ${this._totalPages} (${this._totalItems} items)`;

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
          min-width: 100px;
          text-align: center;
        }
        #page-buttons {
          display: flex;
          gap: 4px;
        }
      </style>
      <button id="first-page">First</button>
      <button id="prev-page">Previous</button>
      <div id="page-buttons"></div>
      <span id="page-info"></span>
      <button id="next-page">Next</button>
      <button id="last-page">Last</button>
    `;
  }
}

customElements.define('ag-pagination', AgPagination);

export { AgPagination };
