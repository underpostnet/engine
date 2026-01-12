/**
 * Module for parsing data query parameters into Mongoose query options.
 * Supports AG Grid filterModel/sortModel as well as simple legacy parameters.
 * @module src/server/data-query.js
 * @namespace DataQuery
 */

export const DataQuery = {
  /**
   * Parse request query parameters into Mongoose query options
   * @param {Object} params - The request query parameters (req.query)
   * @param {string|Object} [params.filterModel] - AG Grid filterModel as JSON string or object
   * @param {string|Object} [params.sortModel] - AG Grid sortModel as JSON string or object
   * @param {number|string} [params.page=1] - Page number for pagination
   * @param {number|string} [params.limit=10] - Items per page for pagination
   * @param {string} [params.sort] - Simple sort field (legacy)
   * @param {string|boolean} [params.asc] - Simple sort direction (legacy, '1'/'true' for asc)
   * @param {string} [params.order] - Simple order string, e.g. "field1:asc,field2:desc" (legacy)
   * @param {Object} [params.query] - Default query object to merge with filters
   * @memberof DataQuery
   * @returns {Object} { query, sort, skip, limit, page }
   */
  parse: (params = {}) => {
    let { filterModel, sortModel, page, limit, sort: sortParam, asc, order, query: defaultQuery } = params;

    // === 1. Pagination ===
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;
    const skip = (page - 1) * limit;

    // === 2. Sorting ===
    const sort = DataQuery._parseSort(sortModel, sortParam, asc, order);

    // === 3. Filtering ===
    const query = DataQuery._parseFilter(filterModel, defaultQuery);

    return { query, sort, skip, limit, page };
  },

  /**
   * Parse sort parameters from AG Grid sortModel or simple sort params
   * @method
   * @param {string|Object} sortModel - AG Grid sortModel as JSON string or object
   * @param {string} sortParam - Simple sort field (legacy)
   * @param {string|boolean} asc - Simple sort direction (legacy)
   * @param {string} order - Simple order string (legacy)
   * @return {Object} sort object for Mongoose
   * @memberof DataQuery
   */
  _parseSort: (sortModel, sortParam, asc, order) => {
    const sort = {};

    // Parse sortModel from string if needed
    if (typeof sortModel === 'string' && sortModel.trim()) {
      try {
        sortModel = JSON.parse(sortModel);
      } catch (e) {
        console.warn('DataQuery: Failed to parse sortModel JSON:', e.message);
        sortModel = null;
      }
    }

    // AG Grid sortModel format: [{ colId: 'field', sort: 'asc' | 'desc' }]
    if (Array.isArray(sortModel) && sortModel.length > 0) {
      sortModel.forEach((sortItem) => {
        if (sortItem && sortItem.colId && sortItem.sort) {
          sort[sortItem.colId] = sortItem.sort === 'asc' ? 1 : -1;
        }
      });
      return sort;
    }

    // Simple sort params (legacy support)
    if (sortParam && typeof sortParam === 'string') {
      const direction = asc === '1' || asc === 'true' || asc === true ? 1 : -1;
      sort[sortParam] = direction;
      return sort;
    }

    // Order param format: "field1:asc,field2:desc"
    if (order && typeof order === 'string') {
      const orderParts = order.split(',');
      orderParts.forEach((part) => {
        const [field, dir] = part.split(':');
        if (field && field.trim()) {
          sort[field.trim()] = dir === 'desc' ? -1 : 1;
        }
      });
      return sort;
    }

    return sort;
  },

  /**
   * Parse filter parameters from AG Grid filterModel
   * @method
   * @param {string|Object} filterModel - AG Grid filterModel as JSON string or object
   * @param {Object} defaultQuery - Default query object to merge with filters
   * @return {Object} query object for Mongoose
   * @memberof DataQuery
   */
  _parseFilter: (filterModel, defaultQuery) => {
    let query = defaultQuery ? { ...defaultQuery } : {};

    // Parse filterModel from string if needed
    if (typeof filterModel === 'string' && filterModel.trim()) {
      try {
        filterModel = JSON.parse(filterModel);
      } catch (e) {
        console.warn('DataQuery: Failed to parse filterModel JSON:', e.message);
        filterModel = null;
      }
    }

    if (!filterModel || typeof filterModel !== 'object' || Array.isArray(filterModel)) {
      return query;
    }

    // Process each filter in the filterModel
    Object.entries(filterModel).forEach(([field, filter]) => {
      if (!field || !filter) return;
      const fieldQuery = DataQuery._parseFieldFilter(field, filter);
      if (fieldQuery) {
        query = { ...query, ...fieldQuery };
      }
    });

    return query;
  },

  /**
   * Parse a single field filter
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The filter object
   * @return {Object|null} query condition for the field or null if invalid
   * @memberof DataQuery
   */
  _parseFieldFilter: (field, filter) => {
    if (!filter || !filter.filterType) {
      return null;
    }

    const { filterType } = filter;

    switch (filterType) {
      case 'text':
        return DataQuery._parseTextFilter(field, filter);
      case 'number':
        return DataQuery._parseNumberFilter(field, filter);
      case 'date':
        return DataQuery._parseDateFilter(field, filter);
      case 'set':
        return DataQuery._parseSetFilter(field, filter);
      case 'multi':
        return DataQuery._parseMultiFilter(field, filter);
      default:
        return null;
    }
  },

  /**
   * Parse text filter
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The filter object
   * @return {Object|null} query condition for the text field or null if invalid
   * @memberof DataQuery
   */
  _parseTextFilter: (field, filter) => {
    const { type, filter: filterValue } = filter;

    if (filterValue === null || filterValue === undefined || filterValue === '') {
      // Handle blank/notBlank without a filter value
      if (type === 'blank' || type === 'notBlank') {
        const query = {};
        if (type === 'blank') {
          query[field] = { $in: [null, ''] };
        } else {
          query[field] = { $nin: [null, ''], $exists: true };
        }
        return query;
      }
      return null;
    }

    const query = {};
    // Escape special regex characters for safety
    const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    switch (type) {
      case 'equals':
        query[field] = filterValue;
        break;
      case 'notEqual':
        query[field] = { $ne: filterValue };
        break;
      case 'contains':
        query[field] = { $regex: escapeRegex(filterValue), $options: 'i' };
        break;
      case 'notContains':
        query[field] = { $not: { $regex: escapeRegex(filterValue), $options: 'i' } };
        break;
      case 'startsWith':
        query[field] = { $regex: `^${escapeRegex(filterValue)}`, $options: 'i' };
        break;
      case 'endsWith':
        query[field] = { $regex: `${escapeRegex(filterValue)}$`, $options: 'i' };
        break;
      case 'blank':
        query[field] = { $in: [null, ''] };
        break;
      case 'notBlank':
        query[field] = { $nin: [null, ''], $exists: true };
        break;
      default:
        query[field] = { $regex: escapeRegex(filterValue), $options: 'i' };
    }

    return query;
  },

  /**
   * Parse number filter
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The filter object
   * @return {Object|null} query condition for the number field or null if invalid
   * @memberof DataQuery
   */
  _parseNumberFilter: (field, filter) => {
    const { type, filter: filterValue, filterTo } = filter;

    if (filterValue === null || filterValue === undefined) {
      return null;
    }

    const query = {};
    const numValue = parseFloat(filterValue);

    if (isNaN(numValue)) {
      return null;
    }

    switch (type) {
      case 'equals':
        query[field] = numValue;
        break;
      case 'notEqual':
        query[field] = { $ne: numValue };
        break;
      case 'lessThan':
        query[field] = { $lt: numValue };
        break;
      case 'lessThanOrEqual':
        query[field] = { $lte: numValue };
        break;
      case 'greaterThan':
        query[field] = { $gt: numValue };
        break;
      case 'greaterThanOrEqual':
        query[field] = { $gte: numValue };
        break;
      case 'inRange':
        if (filterTo !== null && filterTo !== undefined) {
          const numTo = parseFloat(filterTo);
          if (!isNaN(numTo)) {
            query[field] = { $gte: numValue, $lte: numTo };
          }
        }
        break;
      case 'blank':
        query[field] = { $in: [null, undefined] };
        break;
      case 'notBlank':
        query[field] = { $nin: [null, undefined], $exists: true };
        break;
      default:
        query[field] = numValue;
    }

    return query;
  },

  /**
   * Parse date filter
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The filter object
   * @return {Object|null} query condition for the date field or null if invalid
   * @memberof DataQuery
   */
  _parseDateFilter: (field, filter) => {
    const { type, dateFrom, dateTo } = filter;

    // Handle blank/notBlank without dates
    if (type === 'blank' || type === 'notBlank') {
      const query = {};
      if (type === 'blank') {
        query[field] = { $in: [null, undefined] };
      } else {
        query[field] = { $nin: [null, undefined], $exists: true };
      }
      return query;
    }

    if (!dateFrom && !dateTo) {
      return null;
    }

    const query = {};

    const parseDate = (dateStr) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    };

    const fromDate = parseDate(dateFrom);
    const toDate = parseDate(dateTo);

    if (!fromDate && !toDate) {
      return null;
    }

    switch (type) {
      case 'equals':
        if (fromDate) {
          // Match the entire day
          const startOfDay = new Date(fromDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(fromDate);
          endOfDay.setHours(23, 59, 59, 999);
          query[field] = { $gte: startOfDay, $lte: endOfDay };
        }
        break;
      case 'notEqual':
        if (fromDate) {
          const startOfDay = new Date(fromDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(fromDate);
          endOfDay.setHours(23, 59, 59, 999);
          query[field] = { $not: { $gte: startOfDay, $lte: endOfDay } };
        }
        break;
      case 'lessThan':
        if (fromDate) {
          query[field] = { $lt: fromDate };
        }
        break;
      case 'lessThanOrEqual':
        if (fromDate) {
          query[field] = { $lte: fromDate };
        }
        break;
      case 'greaterThan':
        if (fromDate) {
          query[field] = { $gt: fromDate };
        }
        break;
      case 'greaterThanOrEqual':
        if (fromDate) {
          query[field] = { $gte: fromDate };
        }
        break;
      case 'inRange':
        if (fromDate && toDate) {
          // For inRange, set toDate to end of day
          const endOfToDate = new Date(toDate);
          endOfToDate.setHours(23, 59, 59, 999);
          query[field] = { $gte: fromDate, $lte: endOfToDate };
        } else if (fromDate) {
          query[field] = { $gte: fromDate };
        } else if (toDate) {
          const endOfToDate = new Date(toDate);
          endOfToDate.setHours(23, 59, 59, 999);
          query[field] = { $lte: endOfToDate };
        }
        break;
      case 'blank':
        query[field] = { $in: [null, undefined] };
        break;
      case 'notBlank':
        query[field] = { $nin: [null, undefined], $exists: true };
        break;
      default:
        if (fromDate) {
          query[field] = fromDate;
        }
    }

    return query;
  },

  /**
   * Parse set filter
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The filter object
   * @return {Object|null} query condition for the set field or null if invalid
   * @memberof DataQuery
   */
  _parseSetFilter: (field, filter) => {
    const { values } = filter;

    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }

    return { [field]: { $in: values } };
  },

  /**
   * Parse multi filter (combines multiple filters with AND/OR)
   * @method
   * @param {string} field - The field name
   * @param {Object} filter - The multi filter object
   * @return {Object|null} query condition for the multi filter or null if invalid
   * @memberof DataQuery
   */
  _parseMultiFilter: (field, filter) => {
    const { filterModels, operator } = filter;

    if (!Array.isArray(filterModels) || filterModels.length === 0) {
      return null;
    }

    const conditions = filterModels
      .map((subFilter) => DataQuery._parseFieldFilter(field, subFilter))
      .filter((condition) => condition !== null);

    if (conditions.length === 0) {
      return null;
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    // Combine conditions with AND or OR
    if (operator === 'OR') {
      return { $or: conditions };
    } else {
      // AND operator (default)
      return { $and: conditions };
    }
  },
};
