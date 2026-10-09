/**
 * What the Cyberia Studio adds to the Object Layer editor and viewer: the foundation context of
 * the item, the pixel templates, the saga column, the review of a Procedural Engine candidate and
 * the runtime binding of the item. The context arrives as a panel the generic editor and viewer
 * render without knowing Cyberia; a review arrives as a title, a way back and a key the editor
 * sends with its save; a binding arrives as a state and the one action that moves it.
 *
 * @module src/client/components/cyberia/ObjectLayerStudioCyberia.js
 */
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { CyberiaItemCatalogService } from '../../services/cyberia-item-catalog/cyberia-item-catalog.service.js';
import { CyberiaProceduralJobItemService } from '../../services/cyberia-procedural-job-item/cyberia-procedural-job-item.service.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaObjectLayerTemplates } from './ObjectLayerTemplatesCyberia.js';
import { itemContextPanel } from './FoundationContextCyberia.js';
import { ProceduralEngineCyberia } from './ProceduralEngineCyberia.js';
import { sagaColumn } from './SagaCyberia.js';

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
  review: Object.freeze({
    /**
     * The review a Procedural Engine item opens, or null where the key names none.
     * @param {string} key - Id of the job item.
     */
    async resolve(key) {
      const { status, data } = await CyberiaProceduralJobItemService.get({ id: key });
      if (status !== 'success' || !data) return null;
      return {
        jobId: String(data.jobId),
        title: `Reviewing ${data.targetItemId} · revision ${data.revision}`,
        detail: `${data.sourceCid ? 'Update of an existing item' : 'Proposed new item'} · generation ${data.lineage.generationRunId} · seed ${data.seed}. A save stores a new revision for review; nothing is promoted.`,
      };
    },
    /** Returns to the Procedural Engine on the job of a review. */
    close: ({ jobId }) => ProceduralEngineCyberia.open({ jobId }),
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
