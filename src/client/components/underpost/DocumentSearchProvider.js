import { loggerFactory } from '../core/Logger.js';
import { DocumentService } from '../../services/document/document.service.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath } from '../core/Router.js';
import { Css, ThemeEvents, darkTheme, subThemeManager, lightenHex, darkenHex } from '../core/Css.js';
import { s } from '../core/VanillaJs.js';

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
    // Minimum match requirement: allow 1 character for maximum results
    if (!query || query.trim().length < 1) {
      return [];
    }

    try {
      const response = await DocumentService.high({
        params: {
          q: query.trim(),
          limit: 7, // Increased limit for maximum results
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

    // Build tags display with data attributes for click handling
    const tagsHtml = tags
      .filter((tag) => tag !== 'public')
      .slice(0, 3)
      .map((tag) => `<span class="document-search-tag" data-tag-value="${tag}">${tag}</span>`)
      .join('');

    // Attach tag handlers after rendering
    setTimeout(() => {
      DocumentSearchProvider.attachTagHandlers();
    }, 50);

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
   * Attach tag click handlers after results are rendered
   */
  attachTagHandlers: () => {
    setTimeout(() => {
      const tagElements = document.querySelectorAll('.document-search-tag');
      tagElements.forEach((tagEl) => {
        tagEl.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();

          const tagValue = tagEl.getAttribute('data-tag-value') || tagEl.textContent.trim();

          // Open search bar if closed
          if (
            !s('.main-body-btn-ui-bar-custom-open').classList.contains('hide') ||
            !s(`.main-body-btn-ui-open`).classList.contains('hide')
          )
            s('.main-body-btn-bar-custom').click();

          // Find and populate search box
          const searchBox = s('.top-bar-search-box');
          if (searchBox) {
            searchBox.value = tagValue;
            searchBox.focus();

            // Trigger input event to start search
            const inputEvent = new Event('input', { bubbles: true });
            searchBox.dispatchEvent(inputEvent);

            logger.info(`Document search tag clicked: ${tagValue}`);
          }
        };
      });
    }, 50);
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

    // Check if we're already on this document to prevent duplicate history
    const currentUrl = new URL(window.location.href);
    const currentCid = currentUrl.searchParams.get('cid');

    // Only update URL and history if cid is different
    if (currentCid !== result.id) {
      // SPA Navigation: Update panel without page reload
      const path = getProxyPath();
      const queryPath = `?cid=${result.id}`;

      // Update browser history without reload
      if (context.RouterInstance && context.RouterInstance.Navigate) {
        context.RouterInstance.Navigate({
          route: context.currentRoute || 'home',
          path,
          queryPath,
        });
      } else {
        window.history.pushState({}, '', `${path}${queryPath}`);
      }

      // Trigger PanelForm update with the document CID
      if (context.updatePanel) {
        context.updatePanel(result.id);
      } else if (window.PanelFormUpdateEvent) {
        window.PanelFormUpdateEvent(result.id);
      } else if (s('.underpost-panel')) {
        // Direct panel update fallback
        const event = new CustomEvent('panel-update', { detail: { cid: result.id } });
        document.dispatchEvent(event);
      }
    } else {
      logger.info('Already on this document, not creating duplicate history');
    }
  },

  /**
   * Get CSS styles for document search results
   * Uses subThemeManager colors for consistent theming
   * @returns {string} CSS string
   */
  getStyles: () => {
    // Get theme color from subThemeManager
    const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
    const hasThemeColor = themeColor && themeColor !== null;

    // Calculate theme-based colors
    let borderColor, bgColor, hoverBg, hoverBorder, iconColor, textColor;
    let tagBg, tagColor, tagHoverBg, activeBg, activeBorder;

    if (darkTheme) {
      // Dark theme styling
      if (hasThemeColor) {
        borderColor = darkenHex(themeColor, 0.75);
        bgColor = darkenHex(themeColor, 0.85);
        hoverBg = darkenHex(themeColor, 0.75);
        hoverBorder = lightenHex(themeColor, 0.4);
        iconColor = lightenHex(themeColor, 0.5);
        textColor = lightenHex(themeColor, 0.8);
        tagBg = darkenHex(themeColor, 0.6);
        tagColor = lightenHex(themeColor, 0.7);
        tagHoverBg = darkenHex(themeColor, 0.5);
        activeBg = darkenHex(themeColor, 0.7);
        activeBorder = lightenHex(themeColor, 0.3);
      } else {
        borderColor = '#444';
        bgColor = '#2a2a2a';
        hoverBg = '#333';
        hoverBorder = '#0d6efd';
        iconColor = '#aaa';
        textColor = '#e0e0e0';
        tagBg = '#4a4a4a';
        tagColor = '#ffffff';
        tagHoverBg = '#5a5a5a';
        activeBg = '#333';
        activeBorder = '#555';
      }
    } else {
      // Light theme styling
      if (hasThemeColor) {
        borderColor = lightenHex(themeColor, 0.75);
        bgColor = lightenHex(themeColor, 0.92);
        hoverBg = lightenHex(themeColor, 0.85);
        hoverBorder = lightenHex(themeColor, 0.5);
        iconColor = darkenHex(themeColor, 0.3);
        textColor = darkenHex(themeColor, 0.6);
        tagBg = lightenHex(themeColor, 0.7);
        tagColor = darkenHex(themeColor, 0.5);
        tagHoverBg = lightenHex(themeColor, 0.6);
        activeBg = lightenHex(themeColor, 0.85);
        activeBorder = lightenHex(themeColor, 0.5);
      } else {
        borderColor = '#ddd';
        bgColor = '#f9f9f9';
        hoverBg = '#efefef';
        hoverBorder = '#007bff';
        iconColor = '#666';
        textColor = '#333';
        tagBg = '#a2a2a2';
        tagColor = '#ffffff';
        tagHoverBg = '#8a8a8a';
        activeBg = '#e8e8e8';
        activeBorder = '#999';
      }
    }

    return css`
      /* Unified with Panel card styles - theme consistent */
      .search-result-document {
        padding: 8px;
        margin: 2px 0;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        border: 1px solid ${borderColor};
        background: ${bgColor};
        text-align: left;
      }

      .search-result-document:hover {
        background: ${hoverBg};
        border-color: ${hoverBorder};
      }

      .search-result-document .search-result-icon {
        font-size: 18px;
        color: ${iconColor};
        padding-top: 2px;
        min-width: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .search-result-document .search-result-content {
        flex: 1;
        min-width: 0;
      }

      .search-result-document .search-result-title {
        font-weight: 500;
        font-size: 14px;
        color: ${textColor};
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
        color: ${darkTheme ? '#999' : '#888'};
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
        background: ${tagBg};
        color: ${tagColor};
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin: 3px;
        display: inline-block;
        border: 1px solid
          ${hasThemeColor ? (darkTheme ? lightenHex(themeColor, 0.3) : lightenHex(themeColor, 0.6)) : 'transparent'};
      }

      .document-search-tag:hover {
        background: ${tagHoverBg};
        transform: scale(1.05);
      }

      .document-search-tag:active {
        transform: scale(0.98);
      }

      .search-result-document.active-search-result,
      .search-result-document.main-btn-menu-active {
        background: ${activeBg};
        border-color: ${activeBorder};
        box-shadow: 0 0 0 1px ${activeBorder}66;
      }

      /* Active document tags have stronger accent */
      .search-result-document.active-search-result .document-search-tag {
        background: ${hasThemeColor ? (darkTheme ? darkenHex(themeColor, 0.5) : lightenHex(themeColor, 0.65)) : tagBg};
        border-color: ${activeBorder};
      }
    `;
  },
};

export { DocumentSearchProvider };
