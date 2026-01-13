/**
 * Reusable search component with extensible plugin architecture.
 * Provides typeahead search functionality with support for multiple search providers,
 * custom rendering, keyboard navigation, and theme-aware styling.
 * @module src/client/components/core/SearchBox.js
 * @namespace SearchBoxClient
 */

import { loggerFactory } from './Logger.js';
import { s, getAllChildNodes, htmls } from './VanillaJs.js';
import { Translate } from './Translate.js';
import { darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from './Css.js';

const logger = loggerFactory(import.meta);

/**
 * SearchBox singleton object providing extensible search functionality.
 * Supports default menu/route search and pluggable search providers with
 * custom rendering, click handlers, and result merging.
 * @memberof SearchBoxClient
 */
const SearchBox = {
  /**
   * Internal data storage for search state and handlers.
   * @type {object}
   * @memberof SearchBoxClient.SearchBox
   */
  Data: {},

  /**
   * Registry of registered search provider plugins.
   * Each provider implements the search provider interface:
   * - id: Unique identifier string
   * - search: async (query, context) => Promise<Array<result>>
   * - renderResult: (result, index, context) => string (HTML)
   * - onClick: (result, context) => void
   * - priority: number (lower number = higher priority)
   * @type {Array<object>}
   * @memberof SearchBoxClient.SearchBox
   */
  providers: [],

  /**
   * Recent search results manager with localStorage persistence.
   * Tracks clicked results from all providers (routes and custom).
   * Maintains order of most-recent-first results across sessions.
   * @type {object}
   * @memberof SearchBoxClient.SearchBox
   */
  RecentResults: {
    /**
     * Storage key for localStorage persistence
     * @type {string}
     */
    storageKey: 'searchbox_recent_results',

    /**
     * Maximum number of recent results to keep in history
     * @type {number}
     */
    maxResults: 20,

    /**
     * Get all cached recent results from localStorage
     * @returns {Array<object>} Array of recent result objects
     */
    getAll: function () {
      try {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
      } catch (error) {
        logger.warn('Error reading search history from localStorage:', error);
        return [];
      }
    },

    /**
     * Save recent results to localStorage
     * @param {Array<object>} results - Array of results to save
     */
    saveAll: function (results) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(results.slice(0, this.maxResults)));
      } catch (error) {
        logger.warn('Error saving search history to localStorage:', error);
      }
    },

    /**
     * Add a result to recent history (moves to front if duplicate)
     * Removes duplicates and maintains max size limit.
     * Only stores serializable data (excludes DOM elements).
     * @param {object} result - Result object to add (must have id and providerId/routerId)
     */
    add: function (result) {
      if (!result || (!result.id && !result.routerId)) {
        logger.warn('SearchBox.RecentResults.add: Invalid result, missing id or routerId');
        return;
      }

      // Create a clean copy excluding DOM elements (fontAwesomeIcon, imgElement)
      const cleanResult = {
        id: result.id,
        routerId: result.routerId,
        type: result.type,
        providerId: result.providerId,
        title: result.title,
        subtitle: result.subtitle,
        tags: result.tags,
        createdAt: result.createdAt,
        data: result.data,
      };

      const recent = this.getAll();

      // Remove duplicate if it exists (based on id and providerId/routerId)
      const filteredRecent = recent.filter((r) => {
        if (cleanResult.providerId && r.providerId) {
          return !(r.id === cleanResult.id && r.providerId === cleanResult.providerId);
        } else if (cleanResult.routerId && r.routerId) {
          return r.routerId !== cleanResult.routerId;
        }
        return true;
      });

      // Add new result to front
      filteredRecent.unshift(cleanResult);

      // Save to localStorage
      this.saveAll(filteredRecent);
    },

    /**
     * Clear all recent results from localStorage
     */
    clear: function () {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (error) {
        logger.warn('Error clearing search history:', error);
      }
    },

    /**
     * Remove a single result from recent history by ID and provider
     * @param {string} resultId - Result ID to remove
     * @param {string} [providerId] - Provider ID of the result (optional, for routes use null)
     */
    remove: function (resultId, providerId) {
      const recent = this.getAll();
      const filtered = recent.filter((r) => {
        // Match by ID and providerId (or routerId for routes)
        if (providerId) {
          return !(r.id === resultId && r.providerId === providerId);
        } else {
          // For routes (providerId is null), match by routerId instead
          return !(r.routerId === resultId);
        }
      });
      this.saveAll(filtered);
    },
  },

  /**
   * Registers a search provider plugin for extensible search functionality.
   * Replaces any existing provider with the same ID.
   * @memberof SearchBoxClient.SearchBox
   * @param {object} provider - The search provider object to register.
   * @param {string} provider.id - Unique identifier for the provider.
   * @param {Function} provider.search - Async function: (query, context) => Promise<Array<result>>.
   * @param {Function} [provider.renderResult] - Custom renderer: (result, index, context) => HTML string.
   * @param {Function} [provider.onClick] - Click handler: (result, context) => void.
   * @param {number} [provider.priority=50] - Priority for result ordering (lower = higher priority).
   * @returns {void}
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
   * Unregisters a search provider by its ID.
   * @memberof SearchBoxClient.SearchBox
   * @param {string} providerId - The ID of the provider to unregister.
   * @returns {void}
   */
  unregisterProvider: function (providerId) {
    this.providers = this.providers.filter((p) => p.id !== providerId);
    logger.info(`Unregistered search provider: ${providerId}`);
  },

  /**
   * Default result renderer with support for tags and badges.
   * Used when a provider doesn't supply a custom renderResult function.
   * @memberof SearchBoxClient.SearchBox
   * @param {object} result - The search result object to render.
   * @param {string} result.id - Result identifier.
   * @param {string} [result.icon] - HTML for icon display.
   * @param {string} [result.title] - Result title text.
   * @param {string} [result.subtitle] - Result subtitle text.
   * @param {Array<string>} [result.tags] - Array of tag strings.
   * @param {string} result.type - Result type identifier.
   * @param {string} result.providerId - Provider ID that generated this result.
   * @returns {string} HTML string for the search result.
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
   * Navigates through search results using keyboard arrow keys.
   * Optimized for performance with direct DOM manipulation and efficient scrolling.
   * Supports wrap-around navigation (top to bottom and vice versa).
   * @memberof SearchBoxClient.SearchBox
   * @param {string} direction - Navigation direction: 'up' or 'down'.
   * @param {string} containerId - Results container element ID or class name.
   * @param {number} currentIndex - Current active result index (0-based).
   * @param {number} totalItems - Total number of result items.
   * @returns {number} New active index after navigation.
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
   * Searches through default application routes for matches.
   * Backward compatible with Modal.js search functionality.
   * Matches route IDs and translated route names against the query string.
   * @memberof SearchBoxClient.SearchBox
   * @param {string} query - The search query string.
   * @param {object} context - Search context object.
   * @param {object} [context.RouterInstance] - Router instance containing routes.
   * @param {object} [context.options] - Additional search options.
   * @param {string} [context.options.searchCustomImgClass] - Custom image class to search for.
   * @returns {Array<object>} Array of route search results.
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
   * Executes search across all registered providers and default routes.
   * Combines results from multiple sources and sorts by priority.
   * @memberof SearchBoxClient.SearchBox
   * @param {string} query - The search query string.
   * @param {object} [context={}] - Search context object passed to all providers.
   * @returns {Promise<Array<object>>} Promise resolving to combined, priority-sorted results array.
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
   * Renders search results into a container element.
   * Delegates rendering to provider-specific renderers or default route renderer.
   * Automatically attaches click handlers and calls provider post-render hooks.
   * @memberof SearchBoxClient.SearchBox
   * @param {Array<object>} results - Array of search results to render.
   * @param {string} containerId - Results container element ID or class name.
   * @param {object} [context={}] - Render context passed to renderers and handlers.
   * @returns {void}
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

    // Check if this is rendering recently clicked items (not search results)
    // context.isRecentHistory is set when rendering from history, not from search query
    const isRecentHistory = context.isRecentHistory === true;

    let htmlContent = '';
    results.forEach((result, index) => {
      const provider = this.providers.find((p) => p.id === result.providerId);

      let resultHtml = '';
      if (result.type === 'route' || !provider) {
        // Default route rendering (backward compatible)
        resultHtml = this.renderRouteResult(result, index, context);
      } else {
        // Custom provider rendering
        resultHtml = provider.renderResult(result, index, context);
      }

      // Only add delete button for recently clicked items (not search results)
      if (isRecentHistory) {
        // Wrapper with relative position for absolute delete button
        htmlContent += `
          <div class="search-result-wrapper search-result-history-item" data-result-id="${result.id || result.routerId}" data-provider-id="${result.providerId || 'default-routes'}">
            ${resultHtml}
            <button
              class="search-result-delete-btn"
              data-result-id="${result.id || result.routerId}"
              data-provider-id="${result.providerId || 'default-routes'}"
              title="Remove from history"
              aria-label="Remove from history"
            >
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        `;
      } else {
        // Search results: no delete button, no wrapper overhead
        htmlContent += resultHtml;
      }
    });

    container.innerHTML = htmlContent;

    // Attach click handlers
    this.attachClickHandlers(results, containerId, context);

    // Only attach delete handlers for recently clicked items
    if (isRecentHistory) {
      this.attachDeleteHandlers(container, results, containerId, context);
    }

    // Call post-render callbacks from providers
    results.forEach((result) => {
      const provider = this.providers.find((p) => p.id === result.providerId);
      if (provider && provider.attachTagHandlers) {
        provider.attachTagHandlers();
      }
    });
  },

  /**
   * Attaches delete event handlers to result delete buttons within a specific container.
   * Removes only the clicked result from history with smooth animation feedback.
   * Only affects delete buttons within the specified container.
   * @memberof SearchBoxClient.SearchBox
   * @param {HTMLElement} container - The container element to search within.
   * @param {Array<object>} results - Array of search results.
   * @param {string} containerId - Results container element ID or class name.
   * @param {object} [context={}] - Context object.
   * @returns {void}
   */
  attachDeleteHandlers: function (container, results, containerId, context = {}) {
    // Only select delete buttons within this specific container
    const deleteButtons = container.querySelectorAll('.search-result-delete-btn');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const resultId = btn.getAttribute('data-result-id');
        const providerId = btn.getAttribute('data-provider-id');

        // Animate removal
        const wrapper = btn.closest('.search-result-history-item');
        if (wrapper) {
          wrapper.classList.add('search-result-removing');
          setTimeout(() => {
            // Remove only this specific result from history storage
            if (providerId === 'default-routes') {
              this.RecentResults.remove(resultId, null);
            } else {
              this.RecentResults.remove(resultId, providerId);
            }

            // Filter out only the deleted result from the array
            const remaining = results.filter((r) => {
              if (providerId === 'default-routes') {
                // For routes, match by routerId
                return r.routerId !== resultId;
              } else {
                // For providers, match by id and providerId
                return !(r.id === resultId && r.providerId === providerId);
              }
            });

            // Re-render with remaining results (context.isRecentHistory should stay true)
            if (remaining.length > 0) {
              this.renderResults(remaining, containerId, context);
            } else {
              // If no results left, clear container and hide clear-all button
              container.innerHTML = '';
              const clearAllBtn = document.querySelector('.btn-search-history-clear-all');
              if (clearAllBtn) {
                clearAllBtn.style.display = 'none';
              }
            }
          }, 200);
        }
      });
    });
  },

  /**
   * Renders a default route search result.
   * Backward compatible with Modal.js search functionality.
   * Displays route icon and translated route name.
   * @memberof SearchBoxClient.SearchBox
   * @param {object} result - The route result object to render.
   * @param {string} result.routerId - Route identifier.
   * @param {HTMLElement} [result.fontAwesomeIcon] - FontAwesome icon element.
   * @param {HTMLElement} [result.imgElement] - Image icon element.
   * @param {number} index - The index of this result in the results array.
   * @param {object} [context={}] - Render context object.
   * @param {object} [context.options] - Additional rendering options.
   * @returns {string} HTML string for the route search result.
   */
  renderRouteResult: function (result, index, context = {}) {
    const { options = {} } = context;
    const routerId = result.routerId;
    const fontAwesomeIcon = result.fontAwesomeIcon;
    const imgElement = result.imgElement;

    let iconHtml = '';

    // For route results from history, reconstruct icons from DOM
    if (!fontAwesomeIcon && !imgElement && routerId) {
      const routeBtn = s(`.main-btn-${routerId}`);
      if (routeBtn) {
        const icon = getAllChildNodes(routeBtn).find((e) => {
          return e.classList && Array.from(e.classList).find((e) => e.match('fa-') && !e.match('fa-grip-vertical'));
        });
        const img = getAllChildNodes(routeBtn).find((e) => {
          return (
            e.classList &&
            Array.from(e.classList).find((e) =>
              options.searchCustomImgClass ? e.match(options.searchCustomImgClass) : e.match('img-btn-square-menu'),
            )
          );
        });
        if (img) {
          iconHtml = img.outerHTML;
        } else if (icon) {
          iconHtml = icon.outerHTML;
        }
      }
    } else {
      // For fresh search results, use provided DOM elements
      if (imgElement) {
        iconHtml = imgElement.outerHTML;
      } else if (fontAwesomeIcon) {
        iconHtml = fontAwesomeIcon.outerHTML;
      }
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
   * Attaches click event handlers to all rendered search results.
   * Routes trigger menu button clicks; custom providers call their onClick handlers.
   * @memberof SearchBoxClient.SearchBox
   * @param {Array<object>} results - Array of search results.
   * @param {string} containerId - Results container element ID or class name.
   * @param {object} [context={}] - Context object with callbacks.
   * @param {Function} [context.onResultClick] - Callback invoked after any result is clicked.
   * @returns {void}
   */
  attachClickHandlers: function (results, containerId, context = {}) {
    results.forEach((result, index) => {
      const element = s(`[data-result-index="${index}"]`);
      if (!element) return;

      element.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Track result in persistent history for all result types
        this.RecentResults.add(result);

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
   * Scrolls an element into view within a scrollable container if needed.
   * Performance-critical for keyboard navigation - uses direct scrollTop manipulation
   * instead of smooth scrolling to reduce overhead and ensure instant visibility.
   *
   * ROBUST IMPLEMENTATION:
   * - Auto-detects the actual scrollable parent container
   * - Uses getBoundingClientRect() for accurate viewport-aware positioning
   * - Handles complex DOM structures (modals, positioned elements, transforms)
   * - Includes fallback to native scrollIntoView() if custom logic fails
   *
   * Algorithm:
   * 1. Find actual scrollable container (may be parent of passed container)
   * 2. Calculate element position relative to container's visible area
   * 3. Determine scroll adjustment needed (up, down, or none)
   * 4. Apply scroll adjustment
   * 5. Verify visibility and use native scrollIntoView as fallback if needed
   *
   * @memberof SearchBoxClient.SearchBox
   * @param {HTMLElement} element - The element to scroll into view.
   * @param {HTMLElement} container - The scrollable container (or parent of scrollable).
   * @returns {void}
   */
  scrollIntoViewIfNeeded: function (element, container) {
    if (!element || !container) return;

    // CRITICAL FIX: Find the actual scrollable container
    // The passed container might not be scrollable; we need to find the parent that is
    let scrollableContainer = container;

    // Check if current container is scrollable
    const isScrollable = (el) => {
      if (!el) return false;
      const hasScroll = el.scrollHeight > el.clientHeight;
      const overflowY = window.getComputedStyle(el).overflowY;
      return hasScroll && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
    };

    // If container is not scrollable, traverse up to find scrollable parent
    if (!isScrollable(container)) {
      let parent = container.parentElement;
      while (parent && parent !== document.body) {
        if (isScrollable(parent)) {
          scrollableContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }

    // ROBUST POSITION CALCULATION
    // Get element's position relative to scrollable container using getBoundingClientRect
    // This handles all edge cases including transformed elements, scrolled parents, etc.
    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollableContainer.getBoundingClientRect();

    // Calculate element position relative to container's visible area
    const elementTopRelative = elementRect.top - containerRect.top;
    const elementBottomRelative = elementRect.bottom - containerRect.top;
    const containerVisibleHeight = scrollableContainer.clientHeight;

    // Add padding to avoid elements being exactly at edges (better UX)
    const padding = 10;

    // Determine scroll adjustment needed
    let scrollAdjustment = 0;

    // Element is ABOVE visible area
    if (elementTopRelative < padding) {
      // Need to scroll up
      scrollAdjustment = elementTopRelative - padding;
    }
    // Element is BELOW visible area
    else if (elementBottomRelative > containerVisibleHeight - padding) {
      // Need to scroll down
      scrollAdjustment = elementBottomRelative - containerVisibleHeight + padding;
    }

    // Apply scroll adjustment if needed
    if (scrollAdjustment !== 0) {
      scrollableContainer.scrollTop += scrollAdjustment;
    }

    // FALLBACK: If custom scroll didn't work, use native scrollIntoView
    // This ensures visibility even if our calculation fails
    setTimeout(() => {
      const rectCheck = element.getBoundingClientRect();
      const containerRectCheck = scrollableContainer.getBoundingClientRect();
      const stillAbove = rectCheck.top < containerRectCheck.top;
      const stillBelow = rectCheck.bottom > containerRectCheck.bottom;

      if (stillAbove || stillBelow) {
        element.scrollIntoView({
          behavior: 'auto',
          block: stillAbove ? 'start' : 'end',
          inline: 'nearest',
        });
      }
    }, 0);
  },

  /**
   * Gets base CSS styles for SearchBox with theme-aware styling.
   * Uses subThemeManager colors for consistent theming across light and dark modes.
   * Styles include search result items, icons, tags, and active states.
   * @memberof SearchBoxClient.SearchBox
   * @returns {string} CSS string containing all base SearchBox styles.
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
        padding: 12px 14px;
        margin: 4px 0;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        background: transparent;
        min-height: 44px;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
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
        padding: 10px 12px;
        margin: 2px;
        text-align: left;
        min-height: 40px;
      }

      .search-result-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        min-height: 28px;
        font-size: 16px;
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
        font-weight: 500;
        margin-bottom: 2px;
        line-height: 1.4;
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

      /* Wrapper for history items with delete button - maintains original width */
      .search-result-history-item {
        position: relative;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
      }

      .search-result-history-item .search-result-item {
        width: 100%;
        box-sizing: border-box;
        padding-right: 30px; /* Make room for delete button */
      }

      /* Delete button - absolute positioned in top-right corner */
      .search-result-delete-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 3px;
        transition: all 0.2s ease;
        opacity: 0;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        z-index: 5;
      }

      .search-result-history-item:hover .search-result-delete-btn {
        opacity: 1;
        color: ${darkTheme ? '#ff8a8a' : '#e53935'};
        background: ${darkTheme ? 'rgba(255, 107, 107, 0.2)' : 'rgba(211, 47, 47, 0.15)'};
      }

      .search-result-delete-btn:hover {
        background: ${darkTheme ? 'rgba(255, 107, 107, 0.35)' : 'rgba(211, 47, 47, 0.25)'};
        transform: scale(1.1);
      }

      .search-result-delete-btn:active {
        transform: scale(0.95);
      }

      /* Animation for removal */
      .search-result-history-item.search-result-removing {
        opacity: 0;
        transform: translateX(20px);
        transition: all 0.2s ease;
      }
    `;
  },

  /**
   * Injects base SearchBox styles into the document head.
   * Creates a style tag if it doesn't exist, ensuring styles are loaded once.
   * Automatically called when SearchBox is first used.
   * @memberof SearchBoxClient.SearchBox
   * @returns {void}
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
