/**
 * What the Cyberia Studio adds to the Object Layer editor and viewer: the foundation context of
 * the item, the pixel templates and the saga column. The context arrives as a panel the generic
 * editor and viewer render without knowing Cyberia.
 *
 * @module src/client/components/cyberia/ObjectLayerStudioCyberia.js
 */
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { CyberiaObjectLayerTemplates } from './ObjectLayerTemplatesCyberia.js';
import { itemContextPanel } from './FoundationContextCyberia.js';
import { sagaColumn } from './SagaCyberia.js';

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
});
