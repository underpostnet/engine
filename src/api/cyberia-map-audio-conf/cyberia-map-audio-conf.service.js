/**
 * @module src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js
 * @namespace CyberiaMapAudioConfServiceServer
 */

import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';

const logger = loggerFactory(import.meta);

// Resolved per call, not per module: reading a configuration must not require the
// caller to have loaded the cyberia-audio model it never touches.
const getConfModel = (options) => DataBaseProviderService.getModel('CyberiaMapAudioConf', options);
const getAudioModel = (options) => DataBaseProviderService.getModel('CyberiaAudio', options);

/**
 * Parses a `<logic-event-id>:<audio-code>` binding as accepted by the CLI's `--set-event` flag.
 * The separator is the first colon, so an audio code may contain one.
 *
 * @param {string} value - Raw flag value.
 * @returns {{logicEventId: string, audioCode: string}} Parsed binding.
 * @throws {Error} When either side of the separator is empty.
 */
const parseEventAudioBinding = (value) => {
  const separator = `${value ?? ''}`.indexOf(':');
  const logicEventId = separator === -1 ? '' : `${value}`.slice(0, separator).trim();
  const audioCode = separator === -1 ? '' : `${value}`.slice(separator + 1).trim();
  if (!logicEventId || !audioCode) throw new Error(`Expected <logic-event-id>:<audio-code>, received "${value}"`);
  return { logicEventId, audioCode };
};

/**
 * Merges incoming bindings into the ones a map already carries, keyed by logic event.
 *
 * Naming an event replaces that binding and leaves the rest in place, so a CLI call configures
 * what it mentions and nothing else.
 *
 * @param {Array<{logicEventId: string}>} current - Bindings already stored.
 * @param {Array<{logicEventId: string}>} incoming - Bindings being assigned.
 * @returns {Array<object>} The merged list, in stored-then-new order.
 */
const mergeEventBindings = (current = [], incoming = []) => {
  const merged = [...current];
  for (const binding of incoming) {
    const index = merged.findIndex((entry) => entry.logicEventId === binding.logicEventId);
    if (index === -1) merged.push(binding);
    else {
      const settings = binding.settings ?? merged[index].settings;
      merged[index] = { ...binding, ...(settings ? { settings } : {}) };
    }
  }
  return merged;
};

/** Accepts a bare asset code or an object carrying one. */
const readAudioCode = (input) => {
  if (input === null || input === undefined || input === '') return '';
  const code = typeof input === 'string' ? input : input.audioCode ?? input.code;
  if (!code) throw new Error('Missing audio asset code');
  return `${code}`.trim();
};

class CyberiaMapAudioConfService {
  /**
   * Asserts that an imported cyberia-audio asset carries this code.
   *
   * The code is the whole reference a binding stores, so this is where referential integrity is
   * enforced: an unimported asset is refused rather than written as a dangling name. Nothing is
   * copied out of the asset — the binding needs no more of it than its identity.
   *
   * @param {string} audioCode - CyberiaAudio.code.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<string>} The same code, once it is known to resolve.
   * @throws {Error} When no imported cyberia-audio document carries that code.
   */
  static assertAudioCode = async (audioCode, options) => {
    const exists = await getAudioModel(options).exists({ code: audioCode });
    if (!exists) {
      throw new Error(`Unknown audio asset "${audioCode}" — import it first with: cyberia audio ${audioCode} --import`);
    }
    return audioCode;
  };

  /**
   * Fetches the audio configuration of a single map.
   * @param {string} mapCode - CyberiaMap code.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<object|null>} Configuration document, or null when the map has none.
   */
  static getByMapCode = async (mapCode, options) => {
    return await getConfModel(options).findOne({ mapCode }).lean();
  };

  /**
   * Bulk-assigns map audio rules, upserting the map's configuration document.
   *
   * Two callers with two intents share this: the CLI amends one binding at a time and must leave
   * the others alone, while a seed states the whole configuration and must converge on it —
   * otherwise a binding whose logic event was renamed or dropped lives on forever, and the client
   * keeps asking for an asset nothing declares any more. `replaceEvents` is which of the two
   * this call is.
   *
   * @param {Object} rules - Assignment payload.
   * @param {string} rules.mapCode - Target CyberiaMap code.
   * @param {string|null} [rules.defaultMusic] - Default music asset code, or '' / null to clear it.
   * @param {Array<{logicEventId: string, audioCode: string, settings?: object}>} [rules.events] - Bindings.
   * @param {boolean} [rules.replaceEvents=false] - Make `events` the map's complete binding set.
   * @param {object} [rules.settings] - Map-wide volume/loop/crossfade defaults.
   * @param {{host: string, path: string}} options - Provider context.
   * @returns {Promise<object>} The updated configuration document.
   */
  static assign = async ({ mapCode, defaultMusic, events = [], replaceEvents = false, settings }, options) => {
    if (!mapCode) throw new Error('mapCode is required to assign map audio rules');
    const CyberiaMapAudioConf = getConfModel(options);

    const bindings = await Promise.all(
      events.map(async ({ logicEventId, settings: entrySettings, ...reference }) => {
        if (!logicEventId) throw new Error(`Missing logicEventId for an audio binding on map "${mapCode}"`);
        return {
          logicEventId: `${logicEventId}`.trim(),
          audioCode: await CyberiaMapAudioConfService.assertAudioCode(readAudioCode(reference), options),
          ...(entrySettings ? { settings: entrySettings } : {}),
        };
      }),
    );

    const defaultMusicCode = defaultMusic === undefined ? undefined : readAudioCode(defaultMusic);
    if (defaultMusicCode) await CyberiaMapAudioConfService.assertAudioCode(defaultMusicCode, options);

    const conf = (await CyberiaMapAudioConf.findOne({ mapCode })) || new CyberiaMapAudioConf({ mapCode });

    if (defaultMusicCode !== undefined) conf.defaultMusic = defaultMusicCode;
    if (settings) conf.settings = { ...(conf.settings?.toObject?.() ?? conf.settings ?? {}), ...settings };

    const dropped = replaceEvents
      ? (conf.events ?? [])
          .map(({ logicEventId }) => logicEventId)
          .filter((logicEventId) => !bindings.some((binding) => binding.logicEventId === logicEventId))
      : [];
    if (replaceEvents) conf.events = bindings;
    else if (bindings.length > 0) conf.events = mergeEventBindings(conf.events, bindings);

    await conf.save();
    logger.info(`Assigned map audio rules for "${mapCode}"`, {
      defaultMusic: conf.defaultMusic || null,
      events: conf.events.length,
      ...(dropped.length > 0 ? { dropped } : {}),
    });
    return conf;
  };

  static post = async (req, res, options) => {
    /** @type {import('./cyberia-map-audio-conf.model.js').CyberiaMapAudioConfModel} */
    const CyberiaMapAudioConf = DataBaseProviderService.getModel('CyberiaMapAudioConf', options);
    return await new CyberiaMapAudioConf(req.body).save();
  };

  static get = async (req, res, options) => {
    /** @type {import('./cyberia-map-audio-conf.model.js').CyberiaMapAudioConfModel} */
    const CyberiaMapAudioConf = DataBaseProviderService.getModel('CyberiaMapAudioConf', options);
    if (req.params.id) return await CyberiaMapAudioConf.findById(req.params.id);

    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

    const [data, total] = await Promise.all([
      CyberiaMapAudioConf.find(query).sort(sort).limit(limit).skip(skip),
      CyberiaMapAudioConf.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  };

  static put = async (req, res, options) => {
    /** @type {import('./cyberia-map-audio-conf.model.js').CyberiaMapAudioConfModel} */
    const CyberiaMapAudioConf = DataBaseProviderService.getModel('CyberiaMapAudioConf', options);
    return await CyberiaMapAudioConf.findByIdAndUpdate(req.params.id, req.body);
  };

  static delete = async (req, res, options) => {
    /** @type {import('./cyberia-map-audio-conf.model.js').CyberiaMapAudioConfModel} */
    const CyberiaMapAudioConf = DataBaseProviderService.getModel('CyberiaMapAudioConf', options);
    if (req.params.id) return await CyberiaMapAudioConf.findByIdAndDelete(req.params.id);
    else return await CyberiaMapAudioConf.deleteMany();
  };
}

export { CyberiaMapAudioConfService, mergeEventBindings, parseEventAudioBinding };
