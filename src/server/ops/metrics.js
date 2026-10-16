/**
 * Prometheus metrics of the default registry. A module loaded twice shares one metric.
 *
 * @module src/server/ops/metrics.js
 * @namespace OpsMetrics
 */

import * as promClient from 'prom-client';

const registered = (Type, config) => promClient.register.getSingleMetric(config.name) ?? new Type(config);

/**
 * @param {import('prom-client').CounterConfiguration<string>} config
 * @returns {import('prom-client').Counter<string>}
 * @memberof OpsMetrics
 */
const counter = (config) => registered(promClient.Counter, config);

/**
 * @param {import('prom-client').HistogramConfiguration<string>} config
 * @returns {import('prom-client').Histogram<string>}
 * @memberof OpsMetrics
 */
const histogram = (config) => registered(promClient.Histogram, config);

export { counter, histogram };
