import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DataBaseProviderService } from '../../../../src/db/DataBaseProvider.js';
import { CyberiaAudioModel } from '../../../../src/api/cyberia-audio/cyberia-audio.model.js';
import { CyberiaAudioService } from '../../../../src/api/cyberia-audio/cyberia-audio.service.js';
import { CyberiaMapAudioConfModel } from '../../../../src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.model.js';
import { FileModel } from '../../../../src/api/file/file.model.js';
import { FileService } from '../../../../src/api/file/file.service.js';
import { getFallbackMapCodes } from '../../../../src/api/cyberia-instance/cyberia-fallback-world.js';
import {
  audioConfigForMaps, fallbackAudioConfig, hasAudioRenderer, loadAudioRenderer, prepareFallbackAudio,
  seedFallbackAudio, seedInstanceAudio,
} from '../../../../src/projects/cyberia/seed-audio.js';
import {
  DEFAULT_AUDIO_BANK, DEFAULT_AUDIO_BINDINGS, buildAudioEventBindings,
} from '../../../../src/api/cyberia-server-defaults/cyberia-server-defaults.js';
import {
  AUDIO_BUS_MUSIC, AUDIO_BUS_SFX, AUDIO_LOGIC_ID_BUSES, isCanonicalAudioLogicId,
} from '../../../../src/client/components/cyberia/SharedDefaultsCyberia.js';

// Producing WAV bytes needs the cyberia-audio renderer, which lives in a sibling repository this
// one does not contain — so it is absent on a fresh checkout and in CI. The cases below that need
// real bytes are skipped there; everything that checks a rule rather than a recording still runs.
const itRecording = it.skipIf(!hasAudioRenderer());

describe('fallback audio pipeline', () => {
  let directory;
  let recordsPath;
  let audio;
  let files;
  let maps;
  let instances;
  const options = { host: 'audio-test', path: '/' };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-seed-audio-'));
    recordsPath = path.join(directory, 'records');
    audio = new Map(); files = new Map(); maps = new Map(); instances = new Map();
    const CyberiaInstanceModel = {
      findOne: ({ code }) => ({
        select: () => ({ lean: async () => (instances.has(code) ? { cyberiaMapCodes: instances.get(code) } : null) }),
      }),
    };
    vi.spyOn(DataBaseProviderService, 'getModel').mockImplementation((name) => {
      if (name.toLowerCase() === 'cyberiaaudio') return CyberiaAudioModel;
      if (name.toLowerCase() === 'cyberiamapaudioconf') return CyberiaMapAudioConfModel;
      if (name.toLowerCase() === 'file') return FileModel;
      if (name.toLowerCase() === 'cyberiainstance') return CyberiaInstanceModel;
      if (name === 'Document') return { findOne: async () => null };
      if (name === 'User') return {};
      throw new Error(`Unexpected model: ${name}`);
    });
    vi.spyOn(CyberiaAudioModel, 'findOne').mockImplementation(async ({ code }) => audio.get(code) ?? null);
    vi.spyOn(CyberiaAudioModel, 'exists').mockImplementation(async ({ code }) => audio.has(code));
    vi.spyOn(CyberiaAudioModel, 'findOneAndUpdate').mockImplementation(async ({ code }, { $set }) => {
      const doc = new CyberiaAudioModel({ ...audio.get(code)?.toObject(), ...$set });
      await doc.validate(); audio.set(code, doc); return doc;
    });
    vi.spyOn(FileModel, 'findOneAndUpdate').mockImplementation(async ({ _id }, { $set }) => {
      const doc = new FileModel({ _id, ...$set });
      await doc.validate(); files.set(String(_id), doc); return doc;
    });
    vi.spyOn(FileModel, 'findOne').mockImplementation(async ({ _id }) => files.get(String(_id)) ?? null);
    vi.spyOn(FileModel, 'findByIdAndDelete').mockImplementation(async (id) => {
      const doc = files.get(String(id)) ?? null;
      files.delete(String(id));
      return doc;
    });
    vi.spyOn(CyberiaMapAudioConfModel, 'findOne').mockImplementation(async ({ mapCode }) => maps.get(mapCode) ?? null);
    vi.spyOn(CyberiaMapAudioConfModel.prototype, 'save').mockImplementation(async function () {
      await this.validate(); maps.set(this.mapCode, this); return this;
    });
  });

  afterEach(() => { vi.restoreAllMocks(); fs.removeSync(directory); });

  itRecording('generates deterministic WAVs, seeds twice, and serves the same bytes through the generic file service', async () => {
    const config = await prepareFallbackAudio({ recordsPath });
    expect(config.maps.map(({ mapCode }) => mapCode)).toEqual(getFallbackMapCodes());
    const digest = () => Object.fromEntries(config.assets.map((code) => [code,
      createHash('sha256').update(fs.readFileSync(path.join(recordsPath, `${code}.wav`))).digest('hex'),
    ]));
    const hashes = digest();
    await seedFallbackAudio({ recordsPath }, options);
    const ids = [...audio.values()].map(({ fileId }) => String(fileId));
    await prepareFallbackAudio({ recordsPath });
    expect(digest()).toEqual(hashes);
    await seedFallbackAudio({ recordsPath }, options);
    // The vocabulary is the configuration's own asset list, so adding a cue never leaves a
    // hard-coded count behind to correct.
    expect(audio.size).toBe(config.assets.length);
    expect(files.size).toBe(config.assets.length);
    expect(maps.size).toBe(getFallbackMapCodes().length);
    expect([...audio.values()].map(({ fileId }) => String(fileId))).toEqual(ids);
    for (const map of maps.values()) {
      expect(new Set(map.events.map(({ logicEventId }) => logicEventId)).size).toBe(config.events.length);
      for (const event of map.events) expect(audio.has(event.audioCode)).toBe(true);
    }
    for (const code of config.assets) {
      const fileId = String(audio.get(code).fileId);
      const res = { set: vi.fn() };
      const bytes = await FileService.get({ path: `/blob/${fileId}`, params: { id: fileId } }, res, options);
      expect(bytes).toEqual(fs.readFileSync(path.join(recordsPath, `${code}.wav`)));
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'audio/wav');
    }
  }, 20000);

  itRecording('converges on re-seed: a binding the bank no longer declares is dropped', async () => {
    // The failure this prevents: a renamed cue leaves its old binding behind, the client asks the
    // engine for an asset nothing declares, and the map keeps a dangling name forever.
    await prepareFallbackAudio({ recordsPath });
    await seedFallbackAudio({ recordsPath }, options);
    const config = fallbackAudioConfig();
    const [mapCode] = config.maps.map(({ mapCode: code }) => code);

    const stale = maps.get(mapCode);
    stale.events.push({ logicEventId: 'player-hit', audioCode: 'coin' });
    expect(stale.events).toHaveLength(config.events.length + 1);

    await seedFallbackAudio({ recordsPath }, options);
    for (const map of maps.values()) {
      expect(map.events).toHaveLength(config.events.length);
      expect(map.events.some(({ logicEventId }) => logicEventId === 'player-hit')).toBe(false);
      expect(map.events.map(({ logicEventId }) => logicEventId)).toEqual(
        config.events.map(({ logicEventId }) => logicEventId),
      );
    }
  }, 20000);

  itRecording('reuses a file left by an interrupted metadata write and repairs a missing file', async () => {
    await prepareFallbackAudio({ recordsPath });
    const record = { wavPath: path.join(recordsPath, 'coin.wav'), manifestPath: path.join(recordsPath, 'coin.json') };
    CyberiaAudioModel.findOneAndUpdate.mockRejectedValueOnce(new Error('interrupted'));
    await expect(CyberiaAudioService.importRecord(record, options)).rejects.toThrow('interrupted');
    expect(files.size).toBe(1);
    const first = await CyberiaAudioService.importRecord(record, options);
    expect(files.size).toBe(1);
    files.clear();
    const repaired = await CyberiaAudioService.importRecord(record, options);
    expect(String(repaired.fileId)).toBe(String(first.fileId));
    expect(files.size).toBe(1);
  }, 15000);

  itRecording('replaces the blob when a render changes, and leaves no orphan behind', async () => {
    const { dispatch } = await loadAudioRenderer();
    await prepareFallbackAudio({ recordsPath });
    const record = { wavPath: path.join(recordsPath, 'coin.wav'), manifestPath: path.join(recordsPath, 'coin.json') };

    const first = await CyberiaAudioService.importRecord(record, options);
    expect(files.size).toBe(1);
    // Unchanged bytes re-derive the same id: re-importing a bank must not churn File documents.
    const again = await CyberiaAudioService.importRecord(record, options);
    expect(String(again.fileId)).toBe(String(first.fileId));
    expect(files.size).toBe(1);

    // A changed render has to land on a new id — the client fetches and caches the WAV by
    // fileId, so reusing it would serve the old sound forever.
    await dispatch('sfx', 'coin', { sampleRate: 22050, volume: 0.5 }, { play: false, record: true, path: record.wavPath });
    const changed = await CyberiaAudioService.importRecord(record, options);
    expect(String(changed.fileId)).not.toBe(String(first.fileId));
    // And the blob it replaced is gone rather than left for clean-fs to sweep.
    expect(files.has(String(first.fileId))).toBe(false);
    expect(files.size).toBe(1);
    expect(String(audio.get('coin').fileId)).toBe(String(changed.fileId));
  }, 20000);

  itRecording('drops the blob with the asset it belongs to', async () => {
    await prepareFallbackAudio({ recordsPath });
    await CyberiaAudioService.importRecord(
      { wavPath: path.join(recordsPath, 'coin.wav'), manifestPath: path.join(recordsPath, 'coin.json') },
      options,
    );
    expect(files.size).toBe(1);
    expect(await CyberiaAudioService.deleteBackingFiles([audio.get('coin')], options)).toBe(1);
    expect(files.size).toBe(0);
  }, 15000);

  it('registers its File reference so the orphan sweep can see it', () => {
    // `underpost db clean-fs` deletes every File no registered field points at. An unregistered
    // fileId is not an untracked reference — it is a blob the sweep actively deletes.
    const refs = fs.readJsonSync('./src/api/file/file.ref.json');
    expect(refs.find(({ api }) => api === 'cyberia-audio')?.model).toEqual({ fileId: true });
    for (const { api, model } of refs) {
      for (const [field, tracked] of Object.entries(model)) {
        expect(tracked, `${api}.${field} must be tracked`).toBe(true);
      }
    }
  });

  it('rejects malformed data before writing a file', async () => {
    fs.ensureDirSync(recordsPath);
    const wavPath = path.join(recordsPath, 'coin.wav');
    const manifestPath = path.join(recordsPath, 'coin.json');
    fs.writeFileSync(wavPath, 'RIFF');
    fs.writeJsonSync(manifestPath, { id: 'coin', author: 'test', version: '1', duration: 0.5 });
    await expect(CyberiaAudioService.importRecord({ wavPath, manifestPath }, options)).rejects.toThrow('Invalid WAV');
    expect(files.size).toBe(0);
  });

  itRecording('scores every map of an instance alike, and converges on re-seed', async () => {
    instances.set('nexus', ['nexus-hub', 'nexus-deep', 'nexus-vault', 'nexus-rim', 'nexus-gate']);
    await prepareFallbackAudio({ recordsPath });
    await seedInstanceAudio({ instanceCode: 'nexus', recordsPath }, options);

    // One bed for the whole world: what a map sounds like at rest is the world's identity, and
    // the events are what make a moment sound different.
    const expected = audioConfigForMaps(instances.get('nexus'));
    expect(expected.maps.map(({ defaultMusic }) => defaultMusic)).toEqual(Array(5).fill('exploration'));
    expect([...maps.keys()]).toEqual(instances.get('nexus'));
    for (const { mapCode, defaultMusic } of expected.maps) {
      expect(maps.get(mapCode).defaultMusic).toBe(defaultMusic);
      expect(maps.get(mapCode).events).toHaveLength(expected.events.length);
    }

    const stale = maps.get('nexus-hub');
    stale.events.push({ logicEventId: 'player-hit', audioCode: 'coin' });
    await seedInstanceAudio({ instanceCode: 'nexus', recordsPath }, options);
    expect(maps.get('nexus-hub').events).toHaveLength(expected.events.length);
    expect(maps.size).toBe(instances.get('nexus').length);
  }, 20000);

  it('refuses an instance it cannot score', async () => {
    await expect(seedInstanceAudio({ instanceCode: 'absent', recordsPath }, options))
      .rejects.toThrow('cyberia-instance not found for code="absent"');
    instances.set('empty', []);
    await expect(seedInstanceAudio({ instanceCode: 'empty', recordsPath }, options))
      .rejects.toThrow('declares no maps');
  });

  it('sources its whole vocabulary from the centralized defaults', () => {
    const config = fallbackAudioConfig();
    // The seed declares nothing of its own: the bank, the bindings and the vocabulary they use
    // all come from cyberia-server-defaults and SharedDefaultsCyberia.
    expect(config.assets).toEqual(DEFAULT_AUDIO_BANK.map(({ code }) => code));
    expect(config.events).toEqual(buildAudioEventBindings());
    for (const { logicEventId, audioCode } of DEFAULT_AUDIO_BINDINGS) {
      expect(isCanonicalAudioLogicId(logicEventId)).toBe(true);
      expect(config.assets).toContain(audioCode);
    }
    // Routing is derived from the registry, never restated per binding.
    for (const { logicEventId, settings } of config.events) {
      expect(settings.bus).toBe(AUDIO_LOGIC_ID_BUSES[logicEventId] ?? AUDIO_BUS_SFX);
      expect(settings.crossfadeMs > 0).toBe(settings.bus === AUDIO_BUS_MUSIC);
    }
  });

  it('binds the portal charge as a bed and the jump as a one-shot', () => {
    const config = fallbackAudioConfig();
    const cooldown = config.events.find(({ logicEventId }) => logicEventId === 'portal-cooldown');
    const portal = config.events.find(({ logicEventId }) => logicEventId === 'portal');
    // The charge is held for as long as the player waits, so it loops; the jump sounds once.
    expect(cooldown).toMatchObject({ audioCode: 'portal-cooldown', settings: { bus: AUDIO_BUS_MUSIC, loop: true } });
    expect(portal).toMatchObject({ audioCode: 'portal', settings: { bus: AUDIO_BUS_SFX, loop: false } });
  });

  it('keeps the semantic skill vocabulary and makes bus routing a binding setting', () => {
    const config = fallbackAudioConfig();
    expect(config.events.find(({ logicEventId }) => logicEventId === 'projectile').audioCode).toBe('shoot');
    // One impact cue for any collision, and the interface has a voice of its own.
    expect(config.events.find(({ logicEventId }) => logicEventId === 'hit').audioCode).toBe('hit');
    expect(config.events.find(({ logicEventId }) => logicEventId === 'ui-click').audioCode).toBe('ui-click');
    expect(config.events.some(({ logicEventId }) => logicEventId === 'player-hit')).toBe(false);
    expect(config.assets).toContain('hit');
    expect(config.assets).not.toContain('player-hit');
    expect(config.events.find(({ logicEventId }) => logicEventId === 'coin_drop_or_transaction').audioCode).toBe('coin');
    expect(config.events.find(({ logicEventId }) => logicEventId === 'victory').settings.loop).toBe(false);
    expect(new Set(config.maps.map(({ defaultMusic }) => defaultMusic))).toEqual(new Set(['exploration']));
    for (const settings of [{ bus: 'MASTER' }, { volume: 2 }, { pan: -1 }, { pitch: 0 }, { crossfadeMs: Infinity }]) {
      expect(new CyberiaMapAudioConfModel({ mapCode: 'test', settings }).validateSync()).toBeDefined();
    }
  });
});
