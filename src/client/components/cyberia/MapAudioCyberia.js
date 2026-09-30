/**
 * The audio section of the Cyberia map editor: the audio asset that answers each runtime event on
 * the loaded map. `idle` plays no binding: it names the default music the map falls back to.
 *
 * The map editor owns the map. The section reads and writes the map's audio configuration by its
 * code, and "Seed default" writes the same configuration as `run-workflow seed-audio` does.
 *
 * @module src/client/components/cyberia/MapAudioCyberia.js
 */
import { BtnIcon } from '../core/BtnIcon.js';
import { DropDown } from '../core/DropDown.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { htmls, s } from '../core/VanillaJs.js';
import { CyberiaAudioService } from '../../services/cyberia-audio/cyberia-audio.service.js';
import { CyberiaMapAudioConfService } from '../../services/cyberia-map-audio-conf/cyberia-map-audio-conf.service.js';
import { AUDIO_LOGIC_IDS, SKILL_LOGIC_IDS } from './SharedDefaultsCyberia.js';

/** Every runtime event an audio binding answers. */
const AUDIO_EVENTS = Object.freeze([...AUDIO_LOGIC_IDS, ...SKILL_LOGIC_IDS]);
const IDLE = 'idle';
const dropdownId = (logicEventId) => `map-audio-${logicEventId}`;

class MapAudioCyberia {
  static mapCode = null;

  /** The section, collapsed, for the editor's markup. */
  static async renderPanel() {
    const rows = await Promise.all(
      AUDIO_EVENTS.map(
        async ({ id, name, description }) =>
          html`<div class="in" title="${description}">
            ${await DropDown.instance({
            id: dropdownId(id),
            label: id === IDLE ? html`${name} · default music` : html`${name}`,
            data: [],
            containerClass: 'inl',
            resetOption: true,
            serviceProvider: MapAudioCyberia.searchAudioCodes,
          })}
          </div>`,
      ),
    );
    return html`
      ${await BtnIcon.instance({
        class: 'wfa btn-map-audio-toggle',
        label: html`<i class="fa-solid fa-caret-right map-audio-caret"></i> Audio`,
      })}
      <div class="in map-audio-body hide">
        ${rows.join('')}
        <div class="fl">
          <div class="in fll" style="width: 50%;">
            ${await BtnIcon.instance({
              class: 'wfa btn-map-audio-seed-default',
              label: html`<i class="fa-solid fa-seedling"></i> Seed default`,
            })}
          </div>
          <div class="in fll" style="width: 50%;">
            ${await BtnIcon.instance({
              class: 'wfa btn-map-audio-save',
              label: html`<i class="fa-solid fa-floppy-disk"></i> Save audio`,
            })}
          </div>
        </div>
      </div>
    `;
  }

  /** Connects the buttons of the section. */
  static mount() {
    s('.btn-map-audio-toggle').onclick = () => {
      s('.map-audio-body').classList.toggle('hide');
      s('.map-audio-caret').classList.toggle('fa-caret-right');
      s('.map-audio-caret').classList.toggle('fa-caret-down');
    };
    s('.btn-map-audio-seed-default').onclick = () => MapAudioCyberia.seedDefault();
    s('.btn-map-audio-save').onclick = () => MapAudioCyberia.save();
  }

  static async searchAudioCodes(q) {
    const result = await CyberiaAudioService.get({
      limit: 20,
      filterModel: { code: { filterType: 'text', type: 'contains', filter: q } },
    });
    return (result?.data?.data || []).map(({ code }) => ({
      value: code,
      display: code,
      data: code,
      onClick: () => {},
    }));
  }

  /** Shows the audio configuration of a map code. No code clears the section. */
  static async load(mapCode) {
    MapAudioCyberia.mapCode = mapCode;
    const { status, data } = mapCode ? await CyberiaMapAudioConfService.getByMapCode({ mapCode }) : {};
    if (MapAudioCyberia.mapCode !== mapCode) return;
    MapAudioCyberia.show(status === 'success' ? data : null);
  }

  static show(conf) {
    const codes = new Map((conf?.events ?? []).map(({ logicEventId, audioCode }) => [logicEventId, audioCode]));
    for (const { id } of AUDIO_EVENTS) {
      const token = DropDown.Tokens[dropdownId(id)];
      if (!token) continue;
      token.value = (id === IDLE ? conf?.defaultMusic : codes.get(id)) || '';
      htmls(`.dropdown-current-${dropdownId(id)}`, token.value);
    }
  }

  static readCode(logicEventId) {
    const value = DropDown.Tokens[dropdownId(logicEventId)]?.value;
    return typeof value === 'string' ? value : '';
  }

  /** Stores the section as the map's complete configuration: an event with no asset loses its binding. */
  static async save() {
    const { mapCode } = MapAudioCyberia;
    if (!mapCode) return MapAudioCyberia.notifyNoMap();
    const events = AUDIO_EVENTS.filter(({ id }) => id !== IDLE)
      .map(({ id }) => ({ logicEventId: id, audioCode: MapAudioCyberia.readCode(id) }))
      .filter(({ audioCode }) => audioCode);
    const result = await CyberiaMapAudioConfService.assign({
      mapCode,
      body: { defaultMusic: MapAudioCyberia.readCode(IDLE), events, replaceEvents: true },
    });
    MapAudioCyberia.applyResult(result, `Audio of "${mapCode}" saved`);
  }

  static async seedDefault() {
    const { mapCode } = MapAudioCyberia;
    if (!mapCode) return MapAudioCyberia.notifyNoMap();
    const answer = await Modal.RenderConfirm({
      id: 'map-audio-seed-default-confirm',
      html: async () =>
        html`<div class="in section-mp" style="text-align: center">
          Replace the audio of "${mapCode}" with the default bank bindings?
        </div>`,
    });
    if (answer.status !== 'confirm') return;
    const result = await CyberiaMapAudioConfService.seedDefault({ mapCode });
    MapAudioCyberia.applyResult(result, `Default audio seeded on "${mapCode}"`);
  }

  static applyResult(result, message) {
    NotificationManager.Push({
      html: result.status === 'success' ? message : result.message,
      status: result.status,
    });
    if (result.status === 'success' && result.data.mapCode === MapAudioCyberia.mapCode)
      MapAudioCyberia.show(result.data);
  }

  static notifyNoMap() {
    NotificationManager.Push({ html: 'Save or load a map first: its audio is keyed by its code.', status: 'error' });
  }
}

export { MapAudioCyberia };
