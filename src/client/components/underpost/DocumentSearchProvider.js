/**
 * Document search provider for the SearchBox component.
 * Provides typeahead search functionality for documents with custom rendering,
 * click handling, and theme-aware styling.
 * @module src/client/components/underpost/DocumentSearchProvider.js
 * @namespace DocumentSearchProviderClient
 */

import { loggerFactory } from '../core/Logger.js';
import { DocumentService } from '../../services/document/document.service.js';
import { Translate } from '../core/Translate.js';
import { getProxyPath } from '../core/Router.js';
import { Css, ThemeEvents, darkTheme, subThemeManager, lightenHex, darkenHex } from '../core/Css.js';
import { s } from '../core/VanillaJs.js';

const logger = loggerFactory(import.meta);

/**
 * Document Search Provider singleton object for SearchBox integration.
 * Implements the SearchBox provider interface with document-specific search,
 * rendering, and interaction logic.
 * @memberof DocumentSearchProviderClient
 */
const DocumentSearchProvider = {
  /**
   * Unique identifier for this search provider.
   * @type {string}
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   */
  id: 'document-search',

  /**
   * Priority level for search result ordering (lower number = higher priority).
   * Higher priority than default routes (50).
   * @type {number}
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   */
  priority: 10,

  /**
   * Searches documents using the high-query endpoint with optimized matching.
   * Supports case-insensitive, multi-term, multi-field search for maximum results.
   * Minimum query length: 1 character for maximum flexibility.
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   * @param {string} query - The search query string.
   * @param {object} context - Search context object containing RouterInstance and options.
   * @param {object} [context.RouterInstance] - Router instance for navigation.
   * @param {object} [context.options] - Additional search options.
   * @returns {Promise<Array<object>>} Promise resolving to array of search result objects.
   * @returns {Promise<Array<{id: string, type: string, title: string, tags: Array<string>, createdAt: string, data: object}>>}
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
   * Renders a custom result card for a document search result.
   * Generates HTML with title, tags, date, and click handlers.
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   * @param {object} result - The search result object to render.
   * @param {string} result.id - Document ID.
   * @param {string} result.type - Result type (should be 'document').
   * @param {string} result.title - Document title.
   * @param {Array<string>} result.tags - Document tags array.
   * @param {string} result.createdAt - Document creation date.
   * @param {object} result.data - Full document data object.
   * @param {number} index - The index of this result in the results array.
   * @param {object} context - Render context object.
   * @returns {string} HTML string for the search result card.
   */
  renderResult: (result, index, context) => {
    const title = result.title || 'Untitled';
    const tags = result.tags || [];
    const createdAt = result.createdAt ? new Date(result.createdAt).toLocaleDateString() : '';

    // Check if document is public (from result.data.isPublic field)
    const isPublic = result.data && result.data.isPublic === true;

    // Visibility icon: globe for public, padlock for private
    const visibilityIcon = isPublic
      ? '<i class="fas fa-globe" title="Public document"></i>'
      : '<i class="fas fa-lock" title="Private document"></i>';

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
        <div class="search-result-visibility-icon">${visibilityIcon}</div>
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
   * Attaches click event handlers to tag elements in search results.
   * When a tag is clicked, it populates the search box with the tag value
   * and triggers a new search for that tag.
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   * @returns {void}
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
   * Handles click events on document search results.
   * Loads the selected document into the Underpost panel using SPA navigation.
   * Prevents duplicate history entries if already viewing the same document.
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   * @param {object} result - The search result object that was clicked.
   * @param {string} result.id - Document ID to load.
   * @param {string} result.title - Document title for logging.
   * @param {object} context - Click context object with navigation helpers.
   * @param {object} [context.RouterInstance] - Router instance for SPA navigation.
   * @param {string} [context.currentRoute] - Current route name (e.g., 'home').
   * @param {Function} [context.updatePanel] - Function to update the panel with new document.
   * @returns {void}
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
   * Generates CSS styles for document search results with theme support.
   * Uses subThemeManager colors for consistent theming across light and dark modes.
   * Dynamically calculates colors based on current theme and subtheme settings.
   * @memberof DocumentSearchProviderClient.DocumentSearchProvider
   * @returns {string} CSS string containing all styles for document search results.
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
        position: relative;
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

      .search-result-visibility-icon {
        position: absolute;
        top: 35px;
        left: 12px;
        font-size: 12px;
        opacity: 0.7;
        transition: opacity 0.2s ease;
        pointer-events: none;
        z-index: 2;
      }

      .search-result-visibility-icon .fa-globe,
      .search-result-visibility-icon .fa-lock {
        color: ${darkTheme ? '#999' : '#666'};
      }

      .search-result-document:hover .search-result-visibility-icon {
        opacity: 1;
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
