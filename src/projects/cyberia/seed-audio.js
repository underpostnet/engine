import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFallbackMapCodes } from '../../api/cyberia-instance/cyberia-fallback-world.js';
import {
  DEFAULT_AUDIO_BANK,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_MAP_MUSIC,
  buildAudioEventBindings,
} from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { CyberiaAudioService } from '../../api/cyberia-audio/cyberia-audio.service.js';
import { CyberiaMapAudioConfService } from '../../api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';

/**
 * Resolves the canonical audio defaults against a list of map codes.
 *
 * The vocabulary, the bank and the bindings are owned by cyberia-server-defaults; this only states
 * them per map. Every map of a world carries the same bed and the same bindings, so a world sounds
 * like itself wherever the player stands, and what changes a place is the event that fires there.
 *
 * @param {string[]} mapCodes - Map codes the world declares.
 * @returns {{assets: string[], settings: object, events: object[], maps: object[]}}
 */
const audioConfigForMaps = (mapCodes) => ({
  // The codes the world needs imported; the client fetches every one of them by code.
  assets: DEFAULT_AUDIO_BANK.map(({ code }) => code),
  settings: DEFAULT_AUDIO_SETTINGS,
  events: buildAudioEventBindings(),
  maps: mapCodes.map((mapCode) => ({ mapCode, defaultMusic: DEFAULT_MAP_MUSIC })),
});

/** The canonical audio configuration of the fallback world. */
const fallbackAudioConfig = () => audioConfigForMaps(getFallbackMapCodes());

// The renderer lives in cyberia-audio, a sibling repository this one does not contain (see
// .gitignore, alongside cyberia-server and cyberia-client). Named once so the runtime and the
// suites that need real bytes ask the same question of the same path.
const AUDIO_RENDERER_URL = new URL('../../../cyberia-audio/src/dispatcher.js', import.meta.url);

/** Whether the cyberia-audio renderer is present beside this repository. */
const hasAudioRenderer = () => fs.existsSync(AUDIO_RENDERER_URL);

/**
 * Loads the cyberia-audio dispatcher, or says plainly what is missing.
 *
 * A bare dynamic import fails here with a resolver message that names neither the project nor
 * what to do about it, and a fresh checkout hits that before anything else.
 *
 * @returns {Promise<{dispatch: Function}>}
 */
async function loadAudioRenderer() {
  if (!hasAudioRenderer()) {
    throw new Error(
      `cyberia-audio renderer not found at ${fileURLToPath(AUDIO_RENDERER_URL)}. It is a sibling ` +
        'repository, not part of engine — clone it beside this one to record the audio bank.',
    );
  }
  return await import(AUDIO_RENDERER_URL.href);
}

/**
 * Records the fallback audio the world needs, as `<code>.wav` + `<code>.json` pairs.
 *
 * Recording is where the bytes are produced and nowhere else: the client ships no audio and
 * fetches every asset from engine-cyberia by code, so there is no bundle to build alongside these.
 *
 * @param {{recordsPath: string}} params - Output directory for the recorded pairs.
 * @returns {Promise<object>} The fallback audio configuration these recordings satisfy.
 */
async function prepareFallbackAudio({ recordsPath }) {
  const { dispatch } = await loadAudioRenderer();
  const config = fallbackAudioConfig();
  await fs.ensureDir(recordsPath);
  for (const { code, bus, options } of DEFAULT_AUDIO_BANK) {
    const output = path.resolve(recordsPath, `${code}.wav`);
    await dispatch(bus, code, { sampleRate: 22050, ...options }, { play: false, record: true, path: output });
  }
  return config;
}

/**
 * Imports the bank and writes one complete audio configuration per map.
 *
 * @param {object} config - As {@link audioConfigForMaps} resolves it.
 * @param {{recordsPath: string}} params - Directory holding the recorded pairs.
 * @param {{host: string, path: string}} options - Provider context.
 * @returns {Promise<{assets: object[], maps: object[]}>}
 */
async function seedMapAudio(config, { recordsPath }, options) {
  const assets = await CyberiaAudioService.importRecords({ recordsPath, codes: config.assets }, options);
  if (assets.length !== config.assets.length) throw new Error('Seeding audio requires every WAV and manifest pair');
  const maps = [];
  for (const map of config.maps) {
    // The seed states the whole configuration, so re-running it converges: a binding whose logic
    // event this bank no longer declares is dropped rather than left behind pointing at an asset
    // the client can no longer resolve.
    maps.push(
      await CyberiaMapAudioConfService.assign(
        { ...map, settings: config.settings, events: config.events, replaceEvents: true },
        options,
      ),
    );
  }
  return { assets, maps };
}

const seedFallbackAudio = ({ recordsPath }, options) =>
  seedMapAudio(fallbackAudioConfig(), { recordsPath }, options);

/**
 * Scores one instance's maps with the canonical bank.
 *
 * Every map the instance declares is scored with the same bank, bed and bindings the fallback
 * world uses, so any world sounds the way that one does.
 *
 * @param {{instanceCode: string, recordsPath: string}} params - Target instance and records directory.
 * @param {{host: string, path: string}} options - Provider context.
 * @returns {Promise<{assets: object[], maps: object[]}>}
 * @throws {Error} When the instance does not exist or declares no maps.
 */
async function seedInstanceAudio({ instanceCode, recordsPath }, options) {
  const CyberiaInstance = DataBaseProviderService.getModel('CyberiaInstance', options);
  const instance = await CyberiaInstance.findOne({ code: instanceCode }).select('cyberiaMapCodes').lean();
  if (!instance) throw new Error(`cyberia-instance not found for code="${instanceCode}"`);
  const mapCodes = instance.cyberiaMapCodes ?? [];
  if (mapCodes.length === 0) throw new Error(`cyberia-instance "${instanceCode}" declares no maps`);
  return seedMapAudio(audioConfigForMaps(mapCodes), { recordsPath }, options);
}

export {
  audioConfigForMaps,
  fallbackAudioConfig,
  hasAudioRenderer,
  loadAudioRenderer,
  prepareFallbackAudio,
  seedFallbackAudio,
  seedInstanceAudio,
};
