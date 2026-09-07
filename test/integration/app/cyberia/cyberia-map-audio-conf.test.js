'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { CyberiaAudioModel } from '../../../../src/api/cyberia-audio/cyberia-audio.model.js';
import { CyberiaAudioService, readManifest } from '../../../../src/api/cyberia-audio/cyberia-audio.service.js';
import { CyberiaMapAudioConfModel } from '../../../../src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.model.js';
import {
  mergeEventBindings,
  parseEventAudioBinding,
} from '../../../../src/api/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';

// As the recorder writes it: `bus` is the `src/audio-module/<bus-id>/` directory of the module.
const manifestFixture = (id) => ({
  id,
  bus: 'sfx',
  tags: ['fixture'],
  author: 'cyberia-audio',
  version: '0.1.0',
  duration: 0.42,
  sampleRate: 44100,
  channels: 1,
  loop: false,
  audio: `${id}.wav`,
  defaults: { volume: 0.8 },
  parameters: { volume: { min: 0, max: 1, integer: false } },
});

describe('parseEventAudioBinding', () => {
  it('splits a <logic-event-id>:<audio-code> pair and trims both sides', () => {
    expect(parseEventAudioBinding('combat:combat-theme')).to.deep.equal({
      logicEventId: 'combat',
      audioCode: 'combat-theme',
    });
    expect(parseEventAudioBinding(' boss : mystery ')).to.deep.equal({ logicEventId: 'boss', audioCode: 'mystery' });
  });

  it('splits on the first colon so an audio code may contain one', () => {
    expect(parseEventAudioBinding('shoot:pack:laser')).to.deep.equal({ logicEventId: 'shoot', audioCode: 'pack:laser' });
  });

  it('rejects a value with an empty side or no separator', () => {
    for (const bad of ['combat', ':combat', 'combat:', '', ' : ', undefined, null]) {
      expect(() => parseEventAudioBinding(bad), `accepted: ${bad}`).to.throw(/<logic-event-id>:<audio-code>/);
    }
  });
});

describe('mergeEventBindings', () => {
  const stored = [
    { logicEventId: 'combat', audioCode: 'combat' },
    { logicEventId: 'boss', audioCode: 'mystery' },
  ];

  it('replaces the events it names and keeps the rest', () => {
    expect(mergeEventBindings(stored, [{ logicEventId: 'boss', audioCode: 'victory' }])).to.deep.equal([
      { logicEventId: 'combat', audioCode: 'combat' },
      { logicEventId: 'boss', audioCode: 'victory' },
    ]);
  });

  it('appends an event the map does not carry yet', () => {
    expect(mergeEventBindings(stored, [{ logicEventId: 'shoot', audioCode: 'shoot' }])).to.have.length(3);
  });

  it('preserves playback settings when only the asset reference changes', () => {
    expect(mergeEventBindings(
      [{ logicEventId: 'combat', audioCode: 'combat', settings: { bus: 'music', loop: true } }],
      [{ logicEventId: 'combat', audioCode: 'boss' }],
    )).to.deep.equal([
      { logicEventId: 'combat', audioCode: 'boss', settings: { bus: 'music', loop: true } },
    ]);
  });

  it('is a no-op with nothing incoming, and works from an empty map', () => {
    expect(mergeEventBindings(stored, [])).to.deep.equal(stored);
    expect(mergeEventBindings(undefined, [{ logicEventId: 'idle', audioCode: 'exploration' }])).to.deep.equal([
      { logicEventId: 'idle', audioCode: 'exploration' },
    ]);
  });
});

describe('CyberiaAudio schema', () => {
  it('is the asset and nothing else: code, file, manifest', () => {
    expect(Object.keys(CyberiaAudioModel.schema.paths)).to.include.members(['code', 'fileId', 'manifest']);
    // The asset carries no classification of its own; when it plays belongs to the binding.
    expect(CyberiaAudioModel.schema.paths).to.not.have.property('type');
    expect(CyberiaAudioModel.schema.paths).to.not.have.property('logicEventId');
  });

  it('identifies an asset by its code alone', () => {
    const [fields, options] = CyberiaAudioModel.schema.indexes().find(([keys]) => keys.code);
    expect(fields).to.deep.equal({ code: 1 });
    expect(options.unique).to.equal(true);
  });

  it('records the bus a module was authored on, without constraining it', () => {
    const asset = new CyberiaAudioModel({
      code: 'combat',
      manifest: readManifest(manifestFixture('combat'), 'combat.json'),
    });
    expect(asset.validateSync()).to.equal(undefined);
    expect(asset.manifest.bus).to.equal('sfx');
    // Any bus the package ships is stored as provenance; a map binding decides where an asset
    // actually plays, so nothing here validates the value.
    const ambient = new CyberiaAudioModel({
      code: 'drone',
      manifest: readManifest({ ...manifestFixture('drone'), bus: 'ambient' }, 'drone.json'),
    });
    expect(ambient.validateSync()).to.equal(undefined);
    expect(ambient.manifest.bus).to.equal('ambient');
    // The classification this model no longer carries cannot come back through the manifest.
    expect(ambient.manifest.toObject()).to.not.have.property('type');
  });
});

describe('CyberiaMapAudioConf schema', () => {
  it('binds a logic event to an audio code, and nothing more', () => {
    const doc = new CyberiaMapAudioConfModel({
      mapCode: 'FOREST',
      defaultMusic: 'exploration',
      events: [
        { logicEventId: 'combat', audioCode: 'combat' },
        { logicEventId: 'shoot', audioCode: 'shoot', settings: { volume: 0.5 } },
      ],
    });
    expect(doc.validateSync()).to.equal(undefined);
    expect(Object.keys(doc.events[0].toObject())).to.deep.equal(['logicEventId', 'audioCode']);
    // No classification is duplicated between the asset layer and the configuration layer.
    expect(JSON.stringify(doc.toObject())).to.not.match(/"type":/);
  });

  it('keeps omitted overrides absent so map settings can be inherited', () => {
    const doc = new CyberiaMapAudioConfModel({
      mapCode: 'FOREST',
      events: [{ logicEventId: 'combat', audioCode: 'combat' }, { logicEventId: 'shoot', audioCode: 'shoot', settings: { volume: 0.5 } }],
    });
    expect(doc.settings.toObject()).to.deep.equal({});
    expect(doc.events[0].settings.toObject()).to.deep.equal({});
    expect(doc.events[1].settings.volume).to.equal(0.5);
  });

  it('requires a map code, a logic event and the asset the event resolves to', () => {
    expect(new CyberiaMapAudioConfModel({}).validateSync().errors).to.have.property('mapCode');
    const missing = new CyberiaMapAudioConfModel({ mapCode: 'FOREST', events: [{}] }).validateSync().errors;
    expect(missing).to.have.property('events.0.logicEventId');
    expect(missing).to.have.property('events.0.audioCode');
  });

  it('resolves a logic event and the default music to asset codes', () => {
    const doc = new CyberiaMapAudioConfModel({
      mapCode: 'FOREST',
      defaultMusic: 'exploration',
      events: [
        { logicEventId: 'combat', audioCode: 'combat' },
        { logicEventId: 'boss', audioCode: 'mystery' },
      ],
    });
    const resolve = (logicEventId) => doc.events.find((entry) => entry.logicEventId === logicEventId)?.audioCode;
    expect(resolve('combat')).to.equal('combat');
    expect(resolve('boss')).to.equal('mystery');
    expect(resolve('unbound')).to.equal(undefined);
    expect(doc.defaultMusic).to.equal('exploration');
  });

  it('lets one asset answer several logic events, on several maps', () => {
    const forest = new CyberiaMapAudioConfModel({
      mapCode: 'FOREST',
      defaultMusic: 'mystery',
      events: [
        { logicEventId: 'boss', audioCode: 'mystery' },
        { logicEventId: 'ambush', audioCode: 'mystery', settings: { volume: 0.4, crossfadeMs: 800 } },
      ],
    });
    const cave = new CyberiaMapAudioConfModel({ mapCode: 'CAVE', events: [{ logicEventId: 'idle', audioCode: 'mystery' }] });
    expect(forest.validateSync()).to.equal(undefined);
    expect(cave.validateSync()).to.equal(undefined);
    // The same asset, three contexts, one asset document: the binding carries the difference.
    expect(forest.events[1].settings.crossfadeMs).to.equal(800);
    expect(cave.events[0].settings.crossfadeMs).to.equal(undefined);
  });

  it('identifies a configuration by its map code alone', () => {
    const [fields, options] = CyberiaMapAudioConfModel.schema.indexes().find(([keys]) => keys.mapCode);
    expect(fields).to.deep.equal({ mapCode: 1 });
    expect(options.unique).to.equal(true);
  });
});

describe('readManifest', () => {
  it("keeps the recorder's bus under the one name both sides use", () => {
    expect(readManifest(manifestFixture('coin'), 'coin.json')).to.include({ id: 'coin', bus: 'sfx' });
    expect(readManifest({ ...manifestFixture('combat'), bus: 'music' }, 'combat.json').bus).to.equal('music');
  });

  it('leaves the bus empty when the recorder wrote none', () => {
    const { bus, ...bare } = manifestFixture('bare');
    expect(readManifest(bare, 'bare.json').bus).to.equal('');
  });

  it('requires an asset identity, and nothing else', () => {
    expect(() => readManifest({ bus: 'sfx' }, 'bad.json')).to.throw(/no id/);
    expect(() => readManifest(null, 'bad.json')).to.throw(/Invalid audio manifest/);
    expect(readManifest({ id: 'minimal' }, 'minimal.json')).to.deep.equal({ id: 'minimal', bus: '' });
  });
});

describe('CyberiaAudioService.importRecords selection', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberia-audio-records-'));
  });
  afterEach(() => fs.removeSync(directory));

  const writePair = (id, { manifest = true } = {}) => {
    fs.writeFileSync(path.join(directory, `${id}.wav`), Buffer.from('RIFF'));
    if (manifest) fs.writeJsonSync(path.join(directory, `${id}.json`), manifestFixture(id));
  };

  it('skips a WAV that has no manifest beside it, reaching no database', async () => {
    writePair('orphan', { manifest: false });
    expect(await CyberiaAudioService.importRecords({ recordsPath: directory }, { host: 'x', path: '/' })).to.deep.equal(
      [],
    );
  });

  it('rejects a records directory that does not exist', async () => {
    const missing = path.join(directory, 'nope');
    let error;
    await CyberiaAudioService.importRecords({ recordsPath: missing }, {}).catch((caught) => (error = caught));
    expect(error).to.be.an('error');
    expect(error.message).to.contain(missing);
  });

  it('rejects a requested code with no WAV in the directory', async () => {
    writePair('coin');
    let error;
    await CyberiaAudioService.importRecords({ recordsPath: directory, codes: ['laser'] }, {}).catch(
      (caught) => (error = caught),
    );
    expect(error).to.be.an('error');
    expect(error.message).to.contain('No laser.wav found');
  });

  it('ignores non-WAV files and only considers requested codes', async () => {
    writePair('coin');
    writePair('shoot', { manifest: false });
    fs.writeFileSync(path.join(directory, 'notes.txt'), 'ignored');
    // 'coin' is filtered out, 'shoot' has no manifest: nothing is left to import,
    // so the selection resolves without a provider being loaded.
    expect(await CyberiaAudioService.importRecords({ recordsPath: directory, codes: ['shoot'] }, {})).to.deep.equal([]);
  });
});
