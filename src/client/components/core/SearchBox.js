import { loggerFactory } from './Logger.js';
import { s, getAllChildNodes, htmls } from './VanillaJs.js';
import { Translate } from './Translate.js';
import { darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from './Css.js';

const logger = loggerFactory(import.meta);

/**
 * SearchBox - Reusable search component with plugin architecture
 *
 * Supports:
 * - Default menu/route search
 * - Pluggable search providers (async queries)
 * - Custom result renderers
 * - Custom click handlers
 * - Merge default + custom results
 */
const SearchBox = {
  Data: {},

  /**
   * Plugin registry for search providers
   * Each provider should implement:
   * {
   *   id: string,
   *   search: async (query, context) => Promise<Array<{id, data, type}>>,
   *   renderResult: (result, index) => string (HTML),
   *   onClick: (result, context) => void
   * }
   */
  providers: [],

  /**
   * Register a search provider plugin
   */
  registerProvider: function (provider) {
    if (!provider.id || !provider.search) {
      logger.error('Invalid provider. Must have id and search function');
      return;
    }

    // Remove existing provider with same id
    this.providers = this.providers.filter((p) => p.id !== provider.id);

    // Add new provider
    this.providers.push({
      id: provider.id,
      search: provider.search,
      renderResult: provider.renderResult || ((result) => this.defaultRenderResult(result)),
      onClick: provider.onClick || (() => {}),
      priority: provider.priority || 50, // Lower number = higher priority in results
    });

    logger.info(`Registered search provider: ${provider.id}`);
  },

  /**
   * Unregister a search provider
   */
  unregisterProvider: function (providerId) {
    this.providers = this.providers.filter((p) => p.id !== providerId);
    logger.info(`Unregistered search provider: ${providerId}`);
  },

  /**
   * Default result renderer with support for tags/badges
   */
  defaultRenderResult: function (result) {
    const icon = result.icon || '<i class="fas fa-file"></i>';
    const title = result.title || result.id || 'Untitled';
    const subtitle = result.subtitle || '';
    const tags = result.tags || [];

    // Render tags if available
    const tagsHtml =
      tags.length > 0
        ? `<div class="search-result-tags">
             ${tags.map((tag) => `<span class="search-result-tag">${tag}</span>`).join('')}
           </div>`
        : '';

    return html`
      <div
        class="search-result-item"
        data-result-id="${result.id}"
        data-result-type="${result.type}"
        data-provider-id="${result.providerId}"
      >
        <div class="search-result-icon">${icon}</div>
        <div class="search-result-content">
          <div class="search-result-title">${title}</div>
          ${subtitle ? `<div class="search-result-subtitle">${subtitle}</div>` : ''} ${tagsHtml}
        </div>
      </div>
    `;
  },

  /**
   * Navigate through search results with keyboard (optimized for performance)
   * Uses direct DOM manipulation and efficient scrolling
   * @param {string} direction - 'up' or 'down'
   * @param {string} containerId - ID of results container
   * @param {number} currentIndex - Current active index
   * @param {number} totalItems - Total number of items
   * @returns {number} New index
   */
  navigateResults: function (direction, containerId, currentIndex, totalItems) {
    if (!containerId || totalItems === 0) return currentIndex;

    const container = s(`#${containerId}`) || s(`.${containerId}`);
    const allItems = container ? container.querySelectorAll('.search-result-item') : [];

    if (!allItems || allItems.length === 0) return currentIndex;

    // Remove active class from current item (efficient DOM manipulation)
    if (allItems[currentIndex]) {
      allItems[currentIndex].classList.remove('active-search-result');
    }

    // Calculate new index with wrap-around
    let newIndex = currentIndex;
    if (direction === 'up') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : allItems.length - 1;
    } else if (direction === 'down') {
      newIndex = currentIndex < allItems.length - 1 ? currentIndex + 1 : 0;
    }

    // Add active class to new item and ensure visibility
    if (allItems[newIndex]) {
      allItems[newIndex].classList.add('active-search-result');
      // Use optimized scroll method (no animation, instant positioning)
      this.scrollIntoViewIfNeeded(allItems[newIndex], container);
    }

    return newIndex;
  },

  /**
   * Search through default routes (backward compatible with Modal.js)
   */
  searchRoutes: function (query, context) {
    const results = [];
    const { RouterInstance, options = {} } = context;

    if (!RouterInstance) return results;

    const routerInstance = RouterInstance.Routes();
    for (const _routerId of Object.keys(routerInstance)) {
      const routerId = _routerId.slice(1);
      if (routerId) {
        if (
          s(`.main-btn-${routerId}`) &&
          (routerId.toLowerCase().match(query.toLowerCase()) ||
            (Translate.Data[routerId] &&
              Object.keys(Translate.Data[routerId]).filter((keyLang) =>
                Translate.Data[routerId][keyLang].toLowerCase().match(query.toLowerCase()),
              ).length > 0))
        ) {
          const fontAwesomeIcon = getAllChildNodes(s(`.main-btn-${routerId}`)).find((e) => {
            return e.classList && Array.from(e.classList).find((e) => e.match('fa-') && !e.match('fa-grip-vertical'));
          });
          const imgElement = getAllChildNodes(s(`.main-btn-${routerId}`)).find((e) => {
            return (
              e.classList &&
              Array.from(e.classList).find((e) =>
                options.searchCustomImgClass ? e.match(options.searchCustomImgClass) : e.match('img-btn-square-menu'),
              )
            );
          });
          if (imgElement || fontAwesomeIcon) {
            results.push({
              id: routerId,
              routerId,
              fontAwesomeIcon,
              imgElement,
              type: 'route',
              providerId: 'default-routes',
            });
          }
        }
      }
    }
    return results;
  },

  /**
   * Execute search across all providers
   */
  search: async function (query, context = {}) {
    const allResults = [];

    // Always include default route search (backward compatible)
    const routeResults = this.searchRoutes(query, context);
    allResults.push(...routeResults);

    // Execute all registered providers
    const providerPromises = this.providers.map(async (provider) => {
      try {
        const results = await provider.search(query, context);
        return results.map((result) => ({
          ...result,
          providerId: provider.id,
          priority: provider.priority,
        }));
      } catch (error) {
        logger.error(`Error in provider ${provider.id}:`, error);
        return [];
      }
    });

    const providerResults = await Promise.all(providerPromises);
    providerResults.forEach((results) => {
      allResults.push(...results);
    });

    // Sort by priority
    allResults.sort((a, b) => (a.priority || 50) - (b.priority || 50));

    return allResults;
  },

  /**
   * Render search results
   */
  renderResults: function (results, containerId, context = {}) {
    const container = s(`#${containerId}`) || s(`.${containerId}`);
    if (!container) {
      logger.warn(`Container ${containerId} not found`);
      return;
    }

    if (!results || results.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    results.forEach((result, index) => {
      const provider = this.providers.find((p) => p.id === result.providerId);

      if (result.type === 'route' || !provider) {
        // Default route rendering (backward compatible)
        html += this.renderRouteResult(result, index, context);
      } else {
        // Custom provider rendering
        html += provider.renderResult(result, index, context);
      }
    });

    container.innerHTML = html;

    // Attach click handlers
    this.attachClickHandlers(results, containerId, context);

    // Call post-render callbacks from providers
    results.forEach((result) => {
      const provider = this.providers.find((p) => p.id === result.providerId);
      if (provider && provider.attachTagHandlers) {
        provider.attachTagHandlers();
      }
    });
  },

  /**
   * Default route result renderer (backward compatible with Modal.js)
   */
  renderRouteResult: function (result, index, context = {}) {
    const { options = {} } = context;
    const routerId = result.routerId;
    const fontAwesomeIcon = result.fontAwesomeIcon;
    const imgElement = result.imgElement;

    let iconHtml = '';
    if (imgElement) {
      iconHtml = imgElement.outerHTML;
    } else if (fontAwesomeIcon) {
      iconHtml = fontAwesomeIcon.outerHTML;
    }

    const translatedText = Translate.Render(routerId);

    return html`
      <div
        class="search-result-item search-result-route"
        data-result-id="${routerId}"
        data-result-type="route"
        data-result-index="${index}"
        data-provider-id="default-routes"
      >
        <div class="search-result-icon">${iconHtml}</div>
        <div class="search-result-content">
          <div class="search-result-title">${translatedText}</div>
        </div>
      </div>
    `;
  },

  /**
   * Attach click handlers to rendered results
   */
  attachClickHandlers: function (results, containerId, context = {}) {
    results.forEach((result, index) => {
      const element = s(`[data-result-index="${index}"]`);
      if (!element) return;

      element.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const provider = this.providers.find((p) => p.id === result.providerId);

        if (result.type === 'route') {
          // Default route behavior - click the menu button
          const btnSelector = `.main-btn-${result.routerId}`;
          if (s(btnSelector)) {
            s(btnSelector).click();
          }
        } else if (provider && provider.onClick) {
          // Custom provider click handler
          provider.onClick(result, context);
        }

        // Dismiss search box if callback provided
        if (context.onResultClick) {
          context.onResultClick(result);
        }
      };
    });
  },

  /**
   * Scroll element into view if needed - optimized for performance
   * Uses direct scrollTop manipulation instead of smooth scrolling to reduce JS runtime overhead
   * This prevents browser animation overhead and ensures instant visibility
   */
  scrollIntoViewIfNeeded: function (element, container) {
    if (!element || !container) return;

    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Calculate relative positions within container
    const elementTop = elementRect.top - containerRect.top;
    const elementBottom = elementRect.bottom - containerRect.top;
    const containerHeight = containerRect.height;

    // Add small padding to avoid elements being exactly at edges
    const padding = 5;

    if (elementTop < padding) {
      // Element is above visible area or too close to top - scroll up instantly
      container.scrollTop += elementTop - padding;
    } else if (elementBottom > containerHeight - padding) {
      // Element is below visible area or too close to bottom - scroll down instantly
      container.scrollTop += elementBottom - containerHeight + padding;
    }
    // If element is already comfortably visible, do nothing (no unnecessary reflows)
  },

  /**
   * Debounce helper for search-while-typing
   */
  debounce: function (func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Setup search input with auto-search
   */
  setupSearchInput: function (inputId, resultsContainerId, context = {}) {
    const input = s(`#${inputId}`) || s(`.${inputId}`);
    if (!input) {
      logger.warn(`Input ${inputId} not found`);
      return;
    }

    const debounceTime = context.debounceTime || 300;

    const performSearch = this.debounce(async (query) => {
      const trimmedQuery = query ? query.trim() : '';
      const minLength = context.minQueryLength !== undefined ? context.minQueryLength : 1;

      // Support single character searches by default (minQueryLength: 1)
      // Can be configured via context.minQueryLength for different use cases
      if (trimmedQuery.length < minLength) {
        this.renderResults([], resultsContainerId, context);
        return;
      }

      const results = await this.search(trimmedQuery, context);
      this.renderResults(results, resultsContainerId, context);
    }, debounceTime);

    // Store the handler reference
    const handlerId = `search-handler-${inputId}`;
    if (this.Data[handlerId]) {
      input.removeEventListener('input', this.Data[handlerId]);
    }

    this.Data[handlerId] = (e) => {
      performSearch(e.target.value);
    };

    input.addEventListener('input', this.Data[handlerId]);

    logger.info(`Setup search input: ${inputId}`);

    return () => {
      input.removeEventListener('input', this.Data[handlerId]);
      delete this.Data[handlerId];
    };
  },

  /**
   * Clear all providers (useful for cleanup)
   */
  clearProviders: function () {
    this.providers = [];
    logger.info('Cleared all search providers');
  },

  /**
   * Get base CSS styles for SearchBox
   * Uses subThemeManager colors for consistent theming across components
   * @returns {string} CSS string
   */
  getBaseStyles: () => {
    // Get theme color from subThemeManager
    const themeColor = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
    const hasThemeColor = themeColor && themeColor !== null;

    // Calculate theme-based colors
    let activeBg, activeBorder, hoverBg, iconColor, tagBg, tagColor, tagBorder;

    if (darkTheme) {
      // Dark theme styling - solid white icons for better visibility
      iconColor = '#ffffff';
      if (hasThemeColor) {
        activeBg = darkenHex(themeColor, 0.7);
        activeBorder = lightenHex(themeColor, 0.4);
        hoverBg = `${darkenHex(themeColor, 0.8)}33`; // 20% opacity
        tagBg = darkenHex(themeColor, 0.6);
        tagColor = lightenHex(themeColor, 0.7);
        tagBorder = lightenHex(themeColor, 0.3);
      } else {
        activeBg = '#2a2a2a';
        activeBorder = '#444';
        hoverBg = 'rgba(255, 255, 255, 0.05)';
        tagBg = '#333';
        tagColor = '#aaa';
        tagBorder = '#555';
      }
    } else {
      // Light theme styling - solid black icons for better visibility
      iconColor = '#000000';
      if (hasThemeColor) {
        activeBg = lightenHex(themeColor, 0.85);
        activeBorder = lightenHex(themeColor, 0.5);
        hoverBg = `${lightenHex(themeColor, 0.9)}33`; // 20% opacity
        tagBg = lightenHex(themeColor, 0.8);
        tagColor = darkenHex(themeColor, 0.3);
        tagBorder = lightenHex(themeColor, 0.6);
      } else {
        activeBg = '#f0f0f0';
        activeBorder = '#ccc';
        hoverBg = 'rgba(0, 0, 0, 0.05)';
        tagBg = '#e8e8e8';
        tagColor = '#555';
        tagBorder = '#d0d0d0';
      }
    }

    return css`
      /* Search result items - simplified, consistent borders */
      .search-result-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        margin: 4px 0;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        background: transparent;
      }

      .search-result-item:hover {
        background: ${hoverBg};
        border-color: ${activeBorder}44;
      }

      .search-result-item.active-search-result,
      .search-result-item.main-btn-menu-active {
        background: ${activeBg} !important;
        border: 1px solid ${activeBorder} !important;
        box-shadow: 0 0 0 1px ${activeBorder}66 !important;
      }

      .search-result-route {
        padding: 3px;
        margin: 2px;
        text-align: left;
      }

      .search-result-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        color: ${iconColor} !important;
      }

      .search-result-icon i {
        color: ${iconColor} !important;
      }

      .search-result-icon .fa,
      .search-result-icon .fas,
      .search-result-icon .far,
      .search-result-icon .fab {
        color: ${iconColor} !important;
      }

      .search-result-icon img {
        width: 25px;
        height: 25px;
      }

      .search-result-content {
        flex: 1;
        min-width: 0;
      }

      .search-result-title {
        font-size: 14px;
        font-weight: normal;
        margin-bottom: 2px;
      }

      .search-result-subtitle {
        font-size: 12px;
        color: ${darkTheme ? '#999' : '#666'};
        margin-top: 2px;
      }

      /* Tags/Badges - themed with subThemeManager colors */
      .search-result-tag,
      .search-result-badge {
        display: inline-block;
        padding: 2px 8px;
        margin: 2px 4px 2px 0;
        font-size: 11px;
        border-radius: 3px;
        background: ${tagBg};
        color: ${tagColor};
        border: 1px solid ${tagBorder};
        white-space: nowrap;
      }

      .search-result-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
      }

      /* Active item tags have stronger accent */
      .search-result-item.active-search-result .search-result-tag,
      .search-result-item.active-search-result .search-result-badge {
        background: ${hasThemeColor ? (darkTheme ? darkenHex(themeColor, 0.5) : lightenHex(themeColor, 0.75)) : tagBg};
        border-color: ${activeBorder};
        color: ${hasThemeColor ? (darkTheme ? lightenHex(themeColor, 0.8) : darkenHex(themeColor, 0.4)) : tagColor};
      }
    `;
  },

  /**
   * Inject base styles into document
   */
  injectStyles: function () {
    const styleId = 'search-box-base-styles';
    let styleTag = document.getElementById(styleId);

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
      logger.info('Injected SearchBox base styles');
    }

    // Always update styles (for theme changes and subThemeManager color changes)
    styleTag.textContent = this.getBaseStyles();

    // Register theme change handler if not already registered
    if (typeof ThemeEvents !== 'undefined' && !ThemeEvents['searchBoxBaseStyles']) {
      ThemeEvents['searchBoxBaseStyles'] = () => {
        const tag = document.getElementById(styleId);
        if (tag) {
          tag.textContent = this.getBaseStyles();
          logger.info('Updated SearchBox styles for theme change');
        }
      };
    }
  },
};

export { SearchBox };
