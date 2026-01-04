import { loggerFactory } from './Logger.js';
import { s, getAllChildNodes, htmls } from './VanillaJs.js';
import { Translate } from './Translate.js';
import { darkTheme, ThemeEvents } from './Css.js';

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
   * Default result renderer
   */
  defaultRenderResult: function (result) {
    const icon = result.icon || '<i class="fas fa-file"></i>';
    const title = result.title || result.id || 'Untitled';
    const subtitle = result.subtitle || '';

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
          ${subtitle ? `<div class="search-result-subtitle">${subtitle}</div>` : ''}
        </div>
      </div>
    `;
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
   * Scroll element into view if needed
   */
  scrollIntoViewIfNeeded: function (element, container) {
    if (!element || !container) return;

    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (elementRect.top < containerRect.top) {
      // Element is above visible area
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (elementRect.bottom > containerRect.bottom) {
      // Element is below visible area
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
      if (!query || query.trim().length < (context.minQueryLength || 1)) {
        this.renderResults([], resultsContainerId, context);
        return;
      }

      const results = await this.search(query.trim(), context);
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
   * @returns {string} CSS string
   */
  getBaseStyles: () => {
    const activeBg = darkTheme ? '#333' : '#e8e8e8';
    const activeBorder = darkTheme ? '#555' : '#999';
    const activeShadow = darkTheme ? '0 0 8px rgba(255, 255, 255, 0.1)' : '0 0 8px rgba(0, 0, 0, 0.1)';
    const hoverBg = darkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    return css`
      .search-result-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        margin: 4px 0;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }

      .search-result-item:hover {
        background: ${hoverBg};
      }

      .search-result-item.active-search-result,
      .search-result-item.main-btn-menu-active {
        background: ${activeBg};
        border-color: ${activeBorder};
        box-shadow: ${activeShadow};
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
      }

      .search-result-subtitle {
        font-size: 12px;
        color: #666;
        margin-top: 2px;
      }

      /* Theme-specific text colors */
      .search-result-subtitle {
        color: ${darkTheme ? '#aaa' : '#666'};
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

    // Always update styles (for theme changes)
    styleTag.textContent = this.getBaseStyles();

    // Register theme change handler if not already registered
    if (typeof ThemeEvents !== 'undefined' && !ThemeEvents['searchBoxBaseStyles']) {
      ThemeEvents['searchBoxBaseStyles'] = () => {
        const tag = document.getElementById(styleId);
        if (tag) {
          tag.textContent = this.getBaseStyles();
        }
      };
    }
  },
};

export { SearchBox };
