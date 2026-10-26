/**
 * What the Cyberia Studio adds to the Object Layer editor and viewer: the foundation context of
 * the item, the pixel templates, the palette editor of a frame import, the saga column, the review of a
 * Procedural Engine candidate and the runtime binding of the item. The context arrives as a panel the generic editor and viewer
 * render without knowing Cyberia; a review arrives as a title, a way back and a key the editor
 * sends with its save; a binding arrives as a state and the one action that moves it.
 *
 * @module src/client/components/cyberia/ObjectLayerStudioCyberia.js
 */
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { CyberiaProceduralJobService } from '../../services/cyberia-procedural-job/cyberia-procedural-job.service.js';
import { CyberiaProceduralJobItemService } from '../../services/cyberia-procedural-job-item/cyberia-procedural-job-item.service.js';
import { CyberiaProceduralPopulationService } from '../../services/cyberia-procedural-population/cyberia-procedural-population.service.js';
import { CyberiaProceduralProfileService } from '../../services/cyberia-procedural-profile/cyberia-procedural-profile.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaObjectLayerTemplates } from './ObjectLayerTemplatesCyberia.js';
import { itemContextPanel } from './FoundationContextCyberia.js';
import { ProceduralEngineCyberia } from './ProceduralEngineCyberia.js';
import { ProceduralPalette } from './ProceduralPaletteCyberia.js';
import { sagaColumn } from './SagaCyberia.js';
import { authoringOf } from './SharedDefaultsCyberia.js';

const shortCid = (cid) => `${cid.slice(0, 9)}…${cid.slice(-5)}`;

export const CyberiaObjectLayerStudio = Object.freeze({
  templates: CyberiaObjectLayerTemplates,
  /** The columns Cyberia adds to an Object Layer table: the saga that defines each item. */
  columns: () => [sagaColumn('items', (row) => row.data?.item?.id)],
  /**
   * The context panel of the item a key names, or null where the foundation defines none.
   * @param {string} key - cid, document id or item label.
   */
  async context(key) {
    const { status, data } = await ObjectLayerService.getContext({ id: key });
    return status === 'success' && data ? itemContextPanel(data) : null;
  },
  /**
   * The palette editor of a frame import, in `container`: the slots of the Procedural Engine, from
   * the foundation palettes of the item, or any palette of the library, each slot set over it.
   * @param {HTMLElement} container
   * @param {{itemId: () => string}} item - The item id the frames go to, read at each load.
   * @returns {Promise<{request: () => Object, reload: () => void}|null>} The palette of the import
   *   request; null where the server configuration does not load.
   */
  async importPalette(container, { itemId }) {
    const { status, data } = await CyberiaProceduralProfileService.getConfig();
    if (status !== 'success') return null;
    ProceduralPalette.configure(data);
    const entry = ProceduralPalette.editor(container, {
      key: 'object-layer-import',
      title: 'Palette of the mutation',
      random: false,
      read: (paletteId) => CyberiaProceduralProfileService.getImportPalette({ itemId: itemId(), paletteId }),
      describe: (template, palettes) =>
        palettes.length > 0
          ? `Foundation palettes of the item: ${palettes.map(({ name }) => name).join(', ')}`
          : 'The item has no foundation palette: the first palette of the library is the default',
    });
    return { request: () => ProceduralPalette.choice(entry), reload: () => ProceduralPalette.load(entry) };
  },
  review: Object.freeze({
    /**
     * The Procedural Engine work a key names, or null where it names none: an authoring key, a Map
     * Population item a moderator authors by hand; else the id of a job item, a candidate under review.
     * Each comes with a title, a detail and the label of its way back; an authored item also with its
     * id and item type, which a blank editor starts from.
     * @param {string} key
     */
    async resolve(key) {
      const authoring = authoringOf(key);
      if (authoring) {
        const { status, data } = await CyberiaProceduralPopulationService.get({ id: authoring.populationId });
        const target = status === 'success' ? data.targets.find(({ itemId }) => itemId === authoring.itemId) : null;
        if (!target) return null;
        return {
          ...authoring,
          item: { id: target.itemId, type: target.itemType },
          title: `Procedural Engine · ${target.itemId} · authored by hand`,
          back: 'Back to the Procedural Engine',
          detail: `A ${target.itemType} item of map ${data.mapCode}. A save stores a draft definition the item uses; the population publishes it. Nothing runs before then.`,
        };
      }
      const { status, data } = await CyberiaProceduralJobItemService.get({ id: key });
      if (status !== 'success' || !data) return null;
      const job = await CyberiaProceduralJobService.get({ id: String(data.jobId) });
      const populationId = job.status === 'success' && job.data.populationId ? String(job.data.populationId) : '';
      return {
        jobId: String(data.jobId),
        populationId,
        itemId: data.targetItemId,
        title: `${populationId ? 'Procedural Engine · ' : ''}${data.targetItemId} · revision ${data.revision}`,
        back: populationId ? 'Back to the Procedural Engine' : 'Back to review',
        detail: `${data.sourceCid ? 'Update of an existing item' : 'Proposed new item'} · generation ${data.lineage.generationRunId} · seed ${data.seed}. A save stores a new revision for review; nothing is published.`,
      };
    },
    /** Returns to the Procedural Engine: on the item of a Map Population, else on the job of the review. */
    close: ({ jobId, populationId, itemId }) =>
      populationId
        ? ProceduralEngineCyberia.open({ populationId, step: 'items', itemId })
        : ProceduralEngineCyberia.open({ jobId }),
  }),
  binding: Object.freeze({
    /**
     * The runtime binding of the item a definition carries: whether this revision runs, and how to
     * make it run. A save never binds; this is the bind of the Studio.
     * @param {{cid:string,origin:string,archivedAt?:string,data:{item:{id:string}}}} definition
     * @returns {Promise<{title:string,detail:string,bindable:boolean,bind:()=>Promise<boolean>}>}
     */
    async resolve(definition) {
      const itemId = definition.data.item.id;
      const { status, data } = await CyberiaItemCatalogService.get({ id: itemId });
      const active = status === 'success' ? data.objectLayerCid : '';
      const runs = active === definition.cid;
      const runnable = definition.origin !== 'draft' && !definition.archivedAt;
      return {
        title: `${itemId} · ${runs ? 'runtime version' : 'candidate revision'}`,
        detail: runs
          ? `This revision ${shortCid(definition.cid)} is the one the runtime runs.`
          : `${active ? `${itemId} runs ${shortCid(active)}` : `${itemId} is not bound`}. This revision ${shortCid(definition.cid)} ${
              runnable
                ? 'runs only once you bind it'
                : `cannot run: it is ${definition.origin === 'draft' ? 'a draft' : 'archived'}`
            }.`,
        bindable: !runs && runnable,
        async bind() {
          const answer = await Modal.RenderConfirm({
            id: 'ol-bind-confirm',
            html: async () =>
              html`<div class="in section-mp" style="text-align: center">
                Bind ${itemId} to ${shortCid(definition.cid)}? Every world that names ${itemId} runs this revision after
                its next reload.
              </div>`,
          });
          if (answer.status !== 'confirm') return false;
          const response = await CyberiaItemCatalogService.bind({
            itemId,
            objectLayerCid: definition.cid,
            expectedCid: active,
          });
          NotificationManager.Push({
            html:
              response.status === 'success'
                ? `${itemId} runs ${shortCid(definition.cid)}.`
                : response.code === 409
                  ? `Conflict detected. ${response.message}`
                  : response.message,
            status: response.status === 'success' ? 'success' : 'warning',
          });
          return response.status === 'success';
        },
      };
    },
  }),
});
