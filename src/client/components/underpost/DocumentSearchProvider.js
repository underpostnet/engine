import { loggerFactory } from '../core/Logger.js';
import { DocumentService } from '../../services/document/document.service.js';

import { getProxyPath } from '../core/Router.js';

const logger = loggerFactory(import.meta);

/**
 * Document Search Provider for SearchBox
 * Provides typeahead search for documents with custom rendering and click handling
 */
const DocumentSearchProvider = {
  id: 'document-search',
  priority: 10, // Higher priority than default routes (50)

  /**
   * Search documents using high-query endpoint
   * @param {string} query - Search query
   * @param {object} context - Search context
   * @returns {Promise<Array>} Array of search results
   */
  search: async (query, context) => {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const response = await DocumentService.high({
        params: {
          q: query.trim(),
          limit: 5,
        },
      });

      if (response.status === 'success' && response.data && response.data.data) {
        return response.data.data.map((doc) => ({
          id: doc._id,
          type: 'document',
          title: doc.title || 'Untitled',
          tags: doc.tags || [],
          createdAt: doc.createdAt,
          data: doc,
        }));
      }

      return [];
    } catch (error) {
      logger.error('Document search error:', error);
      return [];
    }
  },

  /**
   * Render custom result card for documents
   * @param {object} result - Search result
   * @param {number} index - Result index
   * @param {object} context - Render context
   * @returns {string} HTML string
   */
  renderResult: (result, index, context) => {
    const title = result.title || 'Untitled';
    const tags = result.tags || [];
    const createdAt = result.createdAt ? new Date(result.createdAt).toLocaleDateString() : '';

    // Build tags display
    const tagsHtml = tags
      .filter((tag) => tag !== 'public')
      .slice(0, 3)
      .map((tag) => `<span class="document-search-tag">${tag}</span>`)
      .join('');

    return html`
      <div
        class="search-result-item search-result-document"
        data-result-id="${result.id}"
        data-result-type="document"
        data-result-index="${index}"
        data-provider-id="document-search"
      >
        <div class="search-result-icon">
          <i class="fas fa-file-alt"></i>
        </div>
        <div class="search-result-content">
          <div class="search-result-title">${title}</div>
          <div class="search-result-meta">
            ${createdAt ? `<span class="search-result-date">${createdAt}</span>` : ''}
            ${tagsHtml ? `<div class="search-result-tags">${tagsHtml}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Handle click on document result
   * Loads the document into the Underpost panel
   * @param {object} result - Search result
   * @param {object} context - Click context
   */
  onClick: (result, context) => {
    if (!result || !result.id) {
      logger.warn('Invalid document result');
      return;
    }

    logger.info(`Document clicked: ${result.id} - ${result.title}`);

    // Navigate to the document by updating URL with CID
    const path = getProxyPath();
    const queryPath = `?cid=${result.id}`;

    // Update browser history
    if (context.RouterInstance && context.RouterInstance.Navigate) {
      context.RouterInstance.Navigate({
        route: context.currentRoute || 'home',
        path,
        queryPath,
      });
    } else {
      // Fallback: direct URL update
      window.history.pushState({}, '', `${path}${queryPath}`);
      window.location.reload();
    }

    // Trigger panel update event if available
    if (context.onDocumentSelect) {
      context.onDocumentSelect(result);
    }
  },

  /**
   * Get CSS styles for document search results
   * @returns {string} CSS string
   */
  getStyles: () => css`
    .search-result-document {
      padding: 10px;
      margin: 4px 0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      border: 1px solid var(--border-color, #e0e0e0);
    }

    .search-result-document:hover {
      background: var(--hover-bg, #f5f5f5);
      border-color: var(--primary-color, #007bff);
      transform: translateX(2px);
    }

    .search-result-document .search-result-icon {
      font-size: 20px;
      color: var(--icon-color, #666);
      padding-top: 2px;
    }

    .search-result-document .search-result-content {
      flex: 1;
      min-width: 0;
    }

    .search-result-document .search-result-title {
      font-weight: 500;
      font-size: 14px;
      color: var(--text-color, #333);
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-result-document .search-result-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .search-result-document .search-result-date {
      font-size: 11px;
      color: var(--muted-color, #888);
    }

    .search-result-document .search-result-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .document-search-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--tag-bg, #e3f2fd);
      color: var(--tag-color, #1976d2);
      font-weight: 500;
    }

    /* Dark theme support */
    [data-theme='dark'] .search-result-document {
      border-color: #444;
    }

    [data-theme='dark'] .search-result-document:hover {
      background: #2a2a2a;
      border-color: #0d6efd;
    }

    [data-theme='dark'] .search-result-document .search-result-icon {
      color: #aaa;
    }

    [data-theme='dark'] .search-result-document .search-result-title {
      color: #e0e0e0;
    }

    [data-theme='dark'] .search-result-document .search-result-date {
      color: #999;
    }

    [data-theme='dark'] .document-search-tag {
      background: #1e3a5f;
      color: #64b5f6;
    }
  `,
};

export { DocumentSearchProvider };
