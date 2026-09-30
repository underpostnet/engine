import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AUDIO_BANK } from '../../api/cyberia-server-defaults/cyberia-server-defaults.js';
import { CyberiaAudioService } from '../../api/cyberia-audio/cyberia-audio.service.js';
import { CyberiaMapAudioConfService } from '../../api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';

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
 * Records the canonical audio bank, as `<code>.wav` + `<code>.json` pairs.
 *
 * Recording is where the bytes are produced and nowhere else: the client ships no audio and
 * fetches every asset from engine-cyberia by code, so there is no bundle to build alongside these.
 *
 * @param {{recordsPath: string}} params - Output directory for the recorded pairs.
 * @returns {Promise<void>}
 */
async function recordAudioBank({ recordsPath }) {
  const { dispatch } = await loadAudioRenderer();
  await fs.ensureDir(recordsPath);
  for (const { code, bus, options } of DEFAULT_AUDIO_BANK) {
    const output = path.resolve(recordsPath, `${code}.wav`);
    await dispatch(bus, code, { sampleRate: 22050, ...options }, { play: false, record: true, path: output });
  }
}

/**
 * Scores one instance's maps with the canonical bank: it imports the bank, then writes the default
 * audio configuration of each map. Every map of a world carries the same bed and the same bindings,
 * so a world sounds like itself wherever the player stands, and what changes a place is the event
 * that fires there.
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
  // The codes the world needs imported; the client fetches every one of them by code.
  const codes = DEFAULT_AUDIO_BANK.map(({ code }) => code);
  const assets = await CyberiaAudioService.importRecords({ recordsPath, codes }, options);
  if (assets.length !== codes.length) throw new Error('Seeding audio requires every WAV and manifest pair');
  const maps = [];
  for (const mapCode of mapCodes) maps.push(await CyberiaMapAudioConfService.seedDefault(mapCode, options));
  return { assets, maps };
}

export { hasAudioRenderer, loadAudioRenderer, recordAudioBank, seedInstanceAudio };
