import { loggerFactory } from '../core/Logger.js';
import {
  getProxyPath,
  getPublicRouteParam,
  getViewPath,
  presentPublicRoute,
  publicRoutePath,
  setDocTitle,
} from '../core/Router.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { ItemLedgerService } from '../../services/item-ledger/item-ledger.service.js';
import { ItemLedgerBalanceService } from '../../services/item-ledger-balance/item-ledger-balance.service.js';
import { ItemLedgerTransferService } from '../../services/item-ledger-transfer/item-ledger-transfer.service.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { append, copyData, escapeHtml, htmls, s } from '../core/VanillaJs.js';
import { PublicRoutes, commonModeratorGuard } from '../core/CommonJs.js';
import { Css, darkTheme, dynamicCol, ThemeEvents, Themes, subThemeManager, lightenHex, darkenHex } from '../core/Css.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';
import { Modal, renderViewTitle } from '../core/Modal.js';
import { EventsUI } from '../core/EventsUI.js';
import { Translate } from '../core/Translate.js';
import { isObjectLayerCid } from './ObjectLayerProtocol.js';
import { contextIcon, contextPanelStyle, mountContextPanel } from './ContextPanel.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
const logger = loggerFactory(import.meta);

/** A definition's own view: `/object-layer/:cid`. */
const VIEW_ROUTE = 'objectLayer';
const VIEW_NAMESPACE = PublicRoutes[VIEW_ROUTE].namespace;
const LIST_MODAL_ID = 'modal-object-layer-engine-viewer';

/** A cid in a title: its two ends. */
const shortKey = (key) => (key.length > 18 ? `${key.slice(0, 10)}…${key.slice(-6)}` : key);

/**
 * The Object Layer viewer: the routed list of definitions, and one view of its own for each
 * definition ({@link ObjectLayerViewer}). Every view stays open beside the others.
 */
class ObjectLayerEngineViewer {
  /**
   * What the host binds once, at boot: its store and router, the content profile that names and
   * illustrates the stats, the studio that knows the context of a definition, whether anything
   * mutates, what its table adds, its view titles, and the list a view leads back to.
   * @type {{appStore: object, RouterInstance: object, profile: object|null,
   *   studio: {context: (key: string) => Promise<object|null>}|null, readOnly: boolean,
   *   lifecycle: boolean, columns: () => object[], renderTitle: (text: string) => string,
   *   openList: () => void}}
   */
  static host = {
    appStore: null,
    RouterInstance: null,
    profile: null,
    studio: null,
    readOnly: false,
    lifecycle: false,
    columns: () => [],
    renderTitle: (text) => renderViewTitle({ icon: html`<i class="fa-solid fa-cube"></i>`, text }),
    openList: () => s('.main-btn-object-layer-engine-viewer').click(),
  };

  /** Binds the host. Call it once at boot, before the router renders a viewer route. */
  static configure(host) {
    Object.assign(ObjectLayerEngineViewer.host, host);
  }

  /** The list of definitions: the content of the routed viewer modal. */
  static async instance() {
    const { appStore, readOnly, lifecycle, profile, columns } = ObjectLayerEngineViewer.host;
    return await ObjectLayerManagement.instance({
      appStore,
      idModal: LIST_MODAL_ID,
      readOnly,
      lifecycle,
      profile,
      columns: columns(),
    });
  }

  /**
   * Opens the view of a definition at `/object-layer/:cid`: one view per cid, beside the list and
   * the other views. A view already open comes to the front.
   * @param {{ cid: string }} options
   */
  static async open({ cid }) {
    await new ObjectLayerViewer({ ...ObjectLayerEngineViewer.host, cid }).open();
  }

  /** The `/object-layer` route: the view of the definition its path names, else the list. */
  static route() {
    const cid = getPublicRouteParam(VIEW_ROUTE);
    return cid ? ObjectLayerEngineViewer.open({ cid }) : ObjectLayerEngineViewer.host.openList();
  }
}

/**
 * The view of one definition, in a modal of its own at the path of its cid. Each view holds its
 * own state and finds its elements under its own root.
 */
class ObjectLayerViewer {
  /** @param {typeof ObjectLayerEngineViewer.host & { cid: string }} options */
  constructor({ cid, appStore, RouterInstance, profile, studio, readOnly, renderTitle, openList }) {
    this.cid = cid;
    this.appStore = appStore;
    this.RouterInstance = RouterInstance;
    this.profile = profile;
    this.studio = studio;
    this.readOnly = readOnly;
    this.renderTitle = renderTitle;
    this.openList = openList;
    this.id = `object-layer-viewer-${cid}`;
    this.idModal = `modal-${this.id}`;
    this.data = {
      objectLayer: null,
      frameCounts: null,
      frameDuration: 0,
      currentDirection: 'down',
      currentMode: 'idle',
      webp: null,
      webpMetadata: null,
      // The definition whose animation is in flight.
      generating: null,
      // The render the definition names: `{ renderCid, metadataCid, layout }`, the same on every host.
      render: null,
      renderUnavailable: '',
      // ItemLedger bindings of the definition; null while the ledger loads.
      ledgerBindings: null,
      ledgerUnavailable: '',
      // The studio's context panel of the definition; null while it loads or where it knows none.
      context: null,
      isGeneratingAtlas: false,
      metadataJsonEditor: null,
    };
  }
  // Map user-friendly direction/mode to numeric direction codes
  static getDirectionCode(direction, mode) {
    const key = `${direction}_${mode}`;
    const directionCodeMap = {
      down_idle: '08',
      down_walking: '18',
      up_idle: '02',
      up_walking: '12',
      left_idle: '04',
      left_walking: '14',
      right_idle: '06',
      right_walking: '16',
    };
    return directionCodeMap[key] || null;
  }
  /** An element of this view. */
  el(selector) {
    return s(`.${this.id} ${selector}`);
  }
  els(selector) {
    return document.querySelectorAll(`.${this.id} ${selector}`);
  }
  /** A spinner and a message, for a part of the viewer that waits for the network. */
  static busy(message, content = '') {
    return html`<div class="object-layer-viewer-busy">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>${message}</span>
      ${content}
    </div>`;
  }
  /** The styles of the viewer. They follow the theme and stay while the viewer content changes. */
  static style() {
    return html` <style>
      .object-layer-viewer-busy {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 500px;
        gap: 20px;
        padding: 20px;
        text-align: center;
      }
      .object-layer-viewer-busy > i {
        font-size: 30px;
      }
      .object-layer-viewer-busy-key {
        font-family: monospace;
        font-size: 13px;
        opacity: 0.7;
        word-break: break-all;
      }
      .viewer-unavailable {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 40px 20px;
        text-align: center;
      }
      .viewer-unavailable > i {
        font-size: 36px;
        opacity: 0.6;
      }
      .viewer-unavailable h3 {
        margin: 0;
        font-size: 22px;
      }
      .viewer-unavailable .default-viewer-btn {
        width: auto;
        padding: 12px 24px;
      }
      .background-confirm-modal-remove-atlas-confirm {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
      .atlas-preview-container {
        margin-bottom: 10px;
        width: 100%;
      }
      .atlas-img-wrapper {
        width: 100%;
        overflow: auto;
        border: 1px solid ${darkTheme ? '#444' : '#ddd'};
        border-radius: 8px;
        margin-bottom: 15px;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 10px;
      }
      .atlas-img-preview {
        width: 100%;
        image-rendering: pixelated;
        background: repeating-conic-gradient(#80808020 0% 25%, #fff0 0% 50%) 50% / 20px 20px;
      }
      /* Own pixel size, so one atlas pixel is one screen pixel. */
      .atlas-img-native {
        width: auto;
        height: auto;
        margin: auto;
      }
      .atlas-img-placeholder {
        padding: 20px;
        text-align: center;
        font-size: 13px;
        color: ${darkTheme ? '#aaa' : '#666'};
      }
      .atlas-render-label {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 8px;
        padding: 2px;
        font-size: 14px;
      }
      .atlas-render-size {
        font-size: 12px;
        opacity: 0.75;
      }
      .atlas-metadata-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 15px;
        font-size: 14px;
        opacity: 0.9;
      }
      .atlas-actions-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        width: 100%;
      }
      .webp-placeholder {
        text-align: center;
        color: ${darkTheme ? '#aaa' : '#666'};
      }
      .webp-canvas-container .webp-placeholder img {
        width: 64px !important;
        height: 64px !important;
        margin: 0 auto 16px;
        background: none;
        box-shadow: none;
      }
      .webp-placeholder p {
        margin: 0;
        font-size: 14px;
      }
      .object-layer-viewer-container {
        box-sizing: border-box;
        width: 100%;
        max-width: 1600px;
        margin: 0 auto;
        padding: 20px;
        font-family: 'retro-font';
      }

      .viewer-columns {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        margin: 0 -10px;
      }

      .viewer-column {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        min-width: 0;
        padding: 0 10px;
        overflow-wrap: anywhere;
      }

      .viewer-column > .control-group:last-child,
      .viewer-column > .webp-display-area {
        flex: 1;
      }

      .viewer-atlas-panel,
      .viewer-atlas-panel > .button-group {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      .viewer-atlas-panel .atlas-actions-grid {
        margin-top: auto;
      }

      .object-layer-viewer-container .metadata-json-editor-container {
        border-radius: 6px;
        border: 1px solid ${darkTheme ? '#444' : '#ddd'};
      }

      .object-layer-viewer-container .metadata-json-editor-container .jse-main {
        height: auto;
        min-height: 400px;
      }

      .viewer-metadata-footer {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
      }

      .object-layer-viewer-container .control-group,
      .object-layer-viewer-container .atlas-img-wrapper {
        box-sizing: border-box;
        min-width: 0;
      }

      .object-layer-viewer-container .atlas-img-wrapper {
        justify-content: safe center;
      }

      .object-layer-viewer-container .controls-container .button-group {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      }

      .object-layer-viewer-container button:focus-visible {
        outline: 2px solid ${darkTheme ? '#8ecfff' : '#1565c0'};
        outline-offset: 3px;
      }

      .object-layer-viewer-container .webp-download-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .object-layer-viewer-container .atlas-img-native {
        flex-shrink: 0;
      }

      .object-layer-viewer-container .atlas-metadata-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .viewer-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 20px;
        margin-bottom: 20px;
        padding-bottom: 20px;
        border-bottom: 2px solid ${darkTheme ? '#444' : '#ddd'};
      }

      .viewer-header-preview {
        position: relative;
        flex: 0 0 128px;
        height: 128px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid ${darkTheme ? '#444' : '#ddd'};
        border-radius: 8px;
        background: repeating-conic-gradient(#80808020 0% 25%, #fff0 0% 50%) 50% / 20px 20px;
        color: ${darkTheme ? '#666' : '#bbb'};
        font-size: 40px;
        overflow: hidden;
      }

      .viewer-header-preview img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
      }

      .viewer-header-body {
        flex: 1 1 240px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .viewer-header h2 {
        margin: 0;
        font-size: 26px;
        line-height: 1.2;
        color: ${darkTheme ? '#fff' : '#333'};
        word-break: break-word;
      }

      .viewer-header-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .viewer-tag {
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        background: ${darkTheme ? '#333' : '#eee'};
        color: ${darkTheme ? '#ddd' : '#444'};
      }

      .viewer-header-description {
        margin: 0;
        opacity: 0.85;
      }

      .viewer-header-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .viewer-header-actions .default-viewer-btn {
        width: auto;
        padding: 10px 16px;
        font-size: 14px;
      }

      .viewer-context {
        margin-bottom: 20px;
      }

      ${contextPanelStyle}

      .webp-display-area {
        background: ${darkTheme ? '#2a2a2a' : '#f5f5f5'};
        border: 2px solid ${darkTheme ? '#444' : '#ddd'};
        border-radius: 12px;
        padding: 30px;
        margin-bottom: 20px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 300px;
        height: auto;
        position: relative;
        overflow: auto;
      }

      .webp-canvas-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        align-self: stretch;
      }

      .webp-canvas-container canvas,
      .webp-canvas-container img {
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        -ms-interpolation-mode: nearest-neighbor;
        background: repeating-conic-gradient(#80808020 0% 25%, #fff0 0% 50%) 50% / 20px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        max-width: 100%;
        max-height: 540px;
        width: auto !important;
        height: auto !important;
        object-fit: contain;
        display: block;
      }

      .webp-canvas-container canvas {
        background: repeating-conic-gradient(#80808020 0% 25%, #fff0 0% 50%) 50% / 20px 20px;
        min-width: 128px;
        min-height: 128px;
      }

      .webp-info-badge {
        position: absolute;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.2);
        color: ${darkTheme ? 'white' : 'black'};
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-family: monospace;
        backdrop-filter: blur(4px);
      }

      .webp-info-badge .info-label {
        opacity: 0.7;
        margin-right: 4px;
      }

      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        color: white;
        border-radius: 8px;
        z-index: 10;
      }

      .controls-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-bottom: 20px;
      }

      .control-group {
        background: ${darkTheme ? '#2a2a2a' : '#fff'};
        border: 1px solid ${darkTheme ? '#444' : '#ddd'};
        border-radius: 8px;
        padding: 16px;
      }

      .control-group h4 {
        margin: 0 0 15px 0;
        color: ${darkTheme ? '#fff' : '#333'};
        font-size: 20px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .button-group {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .control-btn {
        flex: 1;
        min-width: 80px;
        padding: 12px 20px;
        border: 2px solid ${darkTheme ? '#444' : '#ddd'};
        background: ${darkTheme ? '#333' : '#f9f9f9'};
        color: ${darkTheme ? '#fff' : '#333'};
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .control-btn:hover {
        background: ${darkTheme ? '#444' : '#f0f0f0'};
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      }

      .control-btn.active {
        background: ${darkTheme ? '#4a9eff' : '#2196F3'};
        color: white;
        border-color: ${darkTheme ? '#4a9eff' : '#2196F3'};
      }

      .control-btn i {
        font-size: 16px;
      }

      .default-viewer-btn {
        position: relative;
        width: 100%;
        padding: 15px;
        background: ${darkTheme ? '#4caf50' : '#4CAF50'};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }

      /* The click spinner replaces the label while the action runs. */
      .default-viewer-btn:has(> [class*='spinner-progress-']) > :not([class*='spinner-progress-']) {
        visibility: hidden;
      }

      .default-viewer-btn:hover {
        /* Over the theme's button:hover border, which would resize the button. */
        border: none;
        background: ${darkTheme ? '#45a049' : '#45a049'};
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
      }

      .control-btn:disabled {
        background: ${darkTheme ? '#555' : '#ccc'};
        cursor: not-allowed;
        transform: none;
        opacity: 0.5;
      }

      .control-btn .frame-count {
        font-size: 11px;
        opacity: 0.7;
        margin-left: 4px;
      }

      .default-viewer-btn:disabled {
        background: ${darkTheme ? '#555' : '#ccc'};
        cursor: not-allowed;
        transform: none;
      }

      .edit-btn {
        background: ${darkTheme ? '#4a9eff' : '#2196F3'};
      }

      .edit-btn:hover {
        background: ${darkTheme ? '#3a8eff' : '#1186f2'};
      }

      @media (max-width: 768px) {
        .webp-display-area {
          min-height: 300px;
          padding: 20px;
        }

        .webp-canvas-container canvas,
        .webp-canvas-container img {
          max-width: 100%;
          max-height: 540px;
          object-fit: contain;
        }
      }

      @media (max-width: 600px) {
        .webp-display-area {
          min-height: 250px;
          padding: 15px;
        }

        .webp-canvas-container canvas,
        .webp-canvas-container img {
          max-height: 340px;
        }

        .button-group {
          flex-direction: column;
        }

        .control-btn {
          min-width: 100%;
        }
      }
      .item-data-key-label {
        font-size: 16px;
        color: ${darkTheme ? '#aaa' : '#666'};
        text-transform: uppercase;
      }
      .item-data-value-label {
        font-size: 20px;
        font-weight: 700;
        color: ${darkTheme ? '#aaa' : '#666'};
        text-align: center;
      }
      .item-stat-entry {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: ${darkTheme ? '#1a1a1a' : '#f9f9f9'};
        border-radius: 6px;
        border: 1px solid ${darkTheme ? '#333' : '#e0e0e0'};
      }
      .no-data-container {
        grid-column: 1 / -1;
        text-align: center;
        color: ${darkTheme ? '#666' : '#999'};
        padding: 20px;
      }
      .ipfs-cid-label {
        font-size: 14px;
        color: ${darkTheme ? '#b0b8c8' : '#555'};
        word-break: break-all;
        padding: 10px 12px;
        border: 1px solid
          ${(() => {
            const tc = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
            return tc ? (darkTheme ? darkenHex(tc, 0.7) : lightenHex(tc, 0.7)) : darkTheme ? '#3a3f4b' : '#d0d5dd';
          })()};
        border-radius: 6px;
        background: ${(() => {
          const tc = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
          return tc ? (darkTheme ? darkenHex(tc, 0.85) : lightenHex(tc, 0.85)) : darkTheme ? '#1a1f2e' : '#f4f6f9';
        })()};
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px;
        line-height: 1.5;
      }
      .ipfs-cid-label i {
        color: ${(() => {
          const tc = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
          return tc ? (darkTheme ? lightenHex(tc, 0.5) : darkenHex(tc, 0.3)) : darkTheme ? '#4a9eff' : '#2196F3';
        })()};
        font-size: 14px;
        flex-shrink: 0;
      }
      .ipfs-cid-label strong {
        color: ${darkTheme ? '#cdd4e0' : '#333'};
        white-space: nowrap;
        font-size: 14px;
      }
      .ipfs-cid-label .ipfs-cid-value {
        flex-basis: 100%;
        min-width: 0;
        user-select: all;
        cursor: text;
        color: ${(() => {
          const tc = darkTheme ? subThemeManager.darkColor : subThemeManager.lightColor;
          return tc ? (darkTheme ? lightenHex(tc, 0.6) : darkenHex(tc, 0.3)) : darkTheme ? '#8ecfff' : '#1565c0';
        })()};
        font-family: monospace;
        font-size: 13px;
      }

      .webp-download-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 5px;
        z-index: 5;
        backdrop-filter: blur(4px);
        transition: all 0.2s ease;
      }
      .webp-download-btn:hover {
        background: rgba(0, 0, 0, 0.75);
        transform: scale(1.05);
      }
      .webp-download-btn i {
        font-size: 12px;
      }

      @media (max-width: 850px) {
        .object-layer-viewer-container {
          padding: 5px;
        }
      }
    </style>`;
  }
  /** Opens the view at the path of its cid, or brings it to the front when it is open. */
  async open() {
    const opened = !!s(`.${this.idModal}`);
    const { barConfig } = await Themes[Css.currentTheme]();
    await Modal.instance({
      id: this.idModal,
      route: VIEW_NAMESPACE,
      publicRoute: VIEW_ROUTE,
      barConfig,
      title: this.renderTitle(escapeHtml(shortKey(this.cid))),
      html: async () => this.html(),
      handleType: 'bar',
      maximize: true,
      mode: 'view',
      slideMenu: 'modal-menu',
      RouterInstance: this.RouterInstance,
    });
    presentPublicRoute(VIEW_ROUTE, this.cid, { idModal: this.idModal, replace: true });
    setDocTitle(VIEW_NAMESPACE);
    if (opened) return;
    ThemeEvents[this.id] = () => htmls(`.style-${this.id}`, ObjectLayerViewer.style());
    Modal.Data[this.idModal].onCloseListener[this.id] = () => this.close();
    await this.load();
  }
  /** The modal content: the view styles and its root, busy until the definition loads. */
  html() {
    return html`
      <div class="hide style-${this.id}">${ObjectLayerViewer.style()}</div>
      <div class="fl">
        <div class="in ${this.id}">
          ${ObjectLayerViewer.busy(
            'Loading object layer',
            html`<span class="object-layer-viewer-busy-key">${escapeHtml(this.cid)}</span>`,
          )}
        </div>
      </div>
    `;
  }
  /** Frees what outlives the modal: the JSON editor and the theme hooks. */
  close() {
    this.data.metadataJsonEditor?.destroy();
    delete ThemeEvents[this.id];
    delete ThemeEvents[`${this.id}-json-editor`];
  }
  /** Titles the view, and the page while the view is the one on screen, with the item's label. */
  present(itemId) {
    htmls(`.title-modal-${this.idModal}`, this.renderTitle(escapeHtml(itemId)));
    if (location.pathname === getViewPath(this.idModal)) setDocTitle(VIEW_NAMESPACE, itemId);
  }
  /** The view of a definition that did not load, with the way back to the list. */
  renderUnavailable(message) {
    if (!s(`.${this.id}`)) return;
    htmls(
      `.${this.id}`,
      html`<div class="object-layer-viewer-container viewer-unavailable">
        <i class="fa-solid fa-circle-exclamation"></i>
        <h3>Object layer unavailable</h3>
        <span class="object-layer-viewer-busy-key">${escapeHtml(this.cid)}</span>
        <p>${escapeHtml(message)}</p>
        <button class="default-viewer-btn ${this.id}-list-btn">
          <i class="fa-solid fa-list"></i>
          <span>Browse object layers</span>
        </button>
      </div>`,
    );
    EventsUI.onClick(`.${this.id}-list-btn`, () => this.openList());
  }
  /** Loads the definition and renders it. The ledger section fills in when the ledger answers. */
  async load({ skipWebp = false } = {}) {
    if (!isObjectLayerCid(this.cid)) return this.renderUnavailable('The path names no Object Layer CID.');
    try {
      const answer = await ObjectLayerService.getMetadata({ id: this.cid });
      const metadata = answer.status === 'success' ? answer.data : null;
      if (!metadata) throw new Error(answer.message || 'the Object Layer service answered no metadata');
      // The ledger lives on another host and the context comes from the studio: each section fills
      // in when it answers.
      const ledger = ObjectLayerViewer.loadLedger(metadata.cid);
      const context = this.loadContext(metadata.cid);
      // The render the definition names and its frame counts, from the Object Layer domain: the
      // same on every host.
      const rendered = !!metadata.data?.render?.cid;
      const [layout, frames] = await Promise.all([
        rendered
          ? AtlasSpriteSheetService.getLayout({ cid: metadata.cid }).catch((error) => ({
              status: 'error',
              message: error.message,
            }))
          : null,
        AtlasSpriteSheetService.getFrameCounts({ cid: metadata.cid }),
      ]);
      const frameData = frames.status === 'success' ? frames.data : null;
      if (!frameData) throw new Error(frames.message || 'the Object Layer service answered no frame counts');
      const render = layout?.status === 'success' && layout.data ? layout.data : null;
      Object.assign(this.data, {
        objectLayer: metadata,
        ledgerBindings: null,
        ledgerUnavailable: '',
        context: null,
        render,
        renderUnavailable: layout && !render ? layout.message || 'the render did not load' : '',
        frameCounts: frameData.frameCounts,
        frameDuration: frameData.frameDuration,
        currentDirection: 'down',
        currentMode: 'idle',
      });
      this.present(metadata.data.item.id);
      await this.renderViewer();
      ledger.then(({ bindings, unavailable }) => {
        this.data.ledgerBindings = bindings;
        this.data.ledgerUnavailable = unavailable;
        if (this.el('.object-layer-viewer-ledger'))
          htmls(`.${this.id} .object-layer-viewer-ledger`, this.ledgerHtml());
      });
      context.then((panel) => {
        this.data.context = panel;
        this.mountContext();
      });
      // A definition that names no render yet is valid; it has nothing to animate.
      if (!skipWebp && rendered) await this.generateWebp();
    } catch (error) {
      logger.error('Error loading object layer:', error);
      this.renderUnavailable(error.message);
    }
  }
  /** The studio's context panel of a definition; null without a studio, or when it does not answer. */
  async loadContext(cid) {
    if (!this.studio) return null;
    try {
      return await this.studio.context(cid);
    } catch (error) {
      logger.warn('The foundation context did not load:', error);
      return null;
    }
  }
  /** Shows the context panel above the metadata, or hides its section where there is none. */
  mountContext() {
    const section = this.el('.viewer-context');
    if (!section) return;
    mountContextPanel(this.el('.viewer-context-panel'), this.data.context);
    section.classList.toggle('hide', !this.data.context);
  }
  /**
   * The ItemLedger bindings of a definition, each with its supply, holders and provenance. None
   * when the definition is unregistered. It never rejects: an unreachable ledger gives a reason.
   * @returns {Promise<{bindings: Array, unavailable: string}>}
   */
  static async loadLedger(cid) {
    if (!cid) return { bindings: [], unavailable: '' };
    try {
      const { status, data: ledger, message } = await ItemLedgerService.getByCid({ cid });
      // An error answer is a ledger that cannot tell, never an unregistered definition.
      if (status !== 'success') return { bindings: [], unavailable: message || 'the ledger did not answer' };
      const bindings = Array.isArray(ledger?.data) ? ledger.data : [];
      await Promise.all(
        bindings.map(async (binding) => {
          const [supply, { data: holders }, { data: transfers }] = await Promise.all([
            ItemLedgerBalanceService.getSupply(binding),
            ItemLedgerBalanceService.getHolders({ ...binding, page: 1, limit: 10 }),
            ItemLedgerTransferService.getProvenance({ ...binding, page: 1, limit: 10 }),
          ]);
          binding.supply = supply.status === 'success' ? supply.data.supply : '';
          binding.holders = Array.isArray(holders?.data) ? holders.data : [];
          binding.transfers = Array.isArray(transfers?.data) ? transfers.data : [];
        }),
      );
      return { bindings, unavailable: '' };
    } catch (error) {
      logger.warn('ItemLedger bindings unavailable', error);
      return { bindings: [], unavailable: error.message || 'the ledger did not answer' };
    }
  }
  /** The body of the Ledger section: a spinner while the ledger loads, then its bindings. */
  ledgerHtml() {
    const { ledgerBindings, ledgerUnavailable } = this.data;
    if (!ledgerBindings)
      return html`<div style="padding: 10px 0;">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span style="margin-left: 10px;">Loading ledger</span>
      </div>`;
    if (ledgerBindings.length === 0)
      return html`<div style="padding: 10px 0;">
        <span class="item-data-key-label">Registration</span>
        <span style="font-weight: 600;">
          ${ledgerUnavailable
            ? `The ledger is unavailable: ${escapeHtml(ledgerUnavailable)}`
            : 'Off-chain (unregistered)'}
        </span>
      </div>`;
    return ledgerBindings
      .map(
        (binding) => html`<div
          style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px 0;"
        >
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="item-data-key-label">Standard</span>
            <span style="font-weight: 600;">${binding.standard}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="item-data-key-label">Chain ID</span>
            <span style="font-weight: 600;">${binding.chainId}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="item-data-key-label">Contract Address</span>
            <span style="font-weight: 600; word-break: break-all;">${binding.contractAddress}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="item-data-key-label">Token ID</span>
            <span style="font-weight: 600; word-break: break-all;">${binding.tokenId}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <span class="item-data-key-label">Supply</span>
            <span style="font-weight: 600;">${binding.supply || '0'}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; grid-column: 1 / -1;">
            <span class="item-data-key-label">Holders</span>
            ${binding.holders.length === 0
              ? html`<span style="font-weight: 600;">None</span>`
              : binding.holders
                  .map(
                    (holder) => html`<span style="font-weight: 600; word-break: break-all;">
                      ${holder.ownerAddress}: ${holder.balance}
                    </span>`,
                  )
                  .join('')}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; grid-column: 1 / -1;">
            <span class="item-data-key-label">Provenance</span>
            ${binding.transfers.length === 0
              ? html`<span style="font-weight: 600;">No transfers indexed</span>`
              : binding.transfers
                  .map(
                    (leg) => html`<span style="font-weight: 600; word-break: break-all;">
                      #${leg.blockNumber} ${leg.from} → ${leg.to}: ${leg.value}
                    </span>`,
                  )
                  .join('')}
          </div>
        </div>`,
      )
      .join('');
  }
  async renderViewer() {
    const columns = `${this.id}-columns`;
    const canMutate =
      !this.readOnly &&
      commonModeratorGuard(this.appStore?.Data?.user?.main?.model?.user?.role || 'guest');
    const { objectLayer, frameCounts } = this.data;
    // The modal closed while the definition loaded.
    if (!objectLayer || !frameCounts || !s(`.${this.id}`)) return;
    const itemType = objectLayer.data.item.type;
    const itemId = objectLayer.data.item.id;
    const itemDescription = objectLayer.data.item.description || '';
    const itemActivable = objectLayer.data.item.activable || false;
    // Get stats data
    const stats = objectLayer.data.stats || {};
    const statDescriptions = this.profile?.statDescriptions || {};
    // Helper function to check if direction/mode has frames
    const hasFrames = (direction, mode) => {
      const numericCode = ObjectLayerViewer.getDirectionCode(direction, mode);
      return numericCode && frameCounts[numericCode] && frameCounts[numericCode] > 0;
    };
    // Helper function to get frame count
    const getFrameCount = (direction, mode) => {
      const numericCode = ObjectLayerViewer.getDirectionCode(direction, mode);
      return numericCode ? frameCounts[numericCode] || 0 : 0;
    };
    // One render: which one it is, how large it is, and its PNG.
    // `native` draws the image at its own pixel size, with no fit to the panel.
    const atlasRender = ({ label, upscaled, native }) => {
      const { layout } = this.data.render;
      const pixelsPerCell = upscaled ? layout.upscaleFactor : layout.cellPixelDim;
      const size =
        pixelsPerCell > 0
          ? `${layout.atlasWidth * pixelsPerCell}x${layout.atlasHeight * pixelsPerCell}px · ${pixelsPerCell}px per cell`
          : '';
      return html`<div class="atlas-render">
        <p class="atlas-render-label">
          <strong class="item-data-key-label">${label}</strong>
          <span class="atlas-render-size">${size}</span>
        </p>
        <div class="atlas-img-wrapper">
          <img
            src="${AtlasSpriteSheetService.renderUrl({ cid: objectLayer.cid, upscaled })}"
            alt="${escapeHtml(itemId)} · ${label}"
            class="in atlas-img-preview ${native ? 'atlas-img-native' : ''}"
          />
        </div>
      </div>`;
    };
    htmls(
      `.${this.id}`,
      html`
        <div class="object-layer-viewer-container">
          ${this.data.isGeneratingAtlas
            ? ObjectLayerViewer.busy('Generating Atlas Sprite Sheet')
            : html`
                <div class="viewer-header">
                  <div class="viewer-header-preview">
                    ${objectLayer.data.render?.cid
                      ? html`<img
                          src="${AtlasSpriteSheetService.idlePreviewUrl(objectLayer.cid)}"
                          alt="${escapeHtml(itemId)}"
                          onerror="this.onerror=null; this.src='${getProxyPath()}assets/ui-icons/empty-render.png'; this.alt='Render unavailable';"
                        />`
                      : html`<img src="${getProxyPath()}assets/ui-icons/empty-render.png" alt="No render" />`}
                  </div>
                  <div class="viewer-header-body">
                    <h2>${escapeHtml(itemId)}</h2>
                    <div class="viewer-header-tags">
                      <span class="viewer-tag">${escapeHtml(itemType)}</span>
                      ${itemActivable ? html`<span class="viewer-tag">Activable</span>` : ''}
                      ${objectLayer.archivedAt ? html`<span class="viewer-tag">Archived</span>` : ''}
                    </div>
                    ${itemDescription
                      ? html`<p class="viewer-header-description">${escapeHtml(itemDescription)}</p>`
                      : ''}
                    <div class="viewer-header-actions">
                      <button class="default-viewer-btn ${this.id}-copy-link-btn">
                        <i class="fa-solid fa-link"></i>
                        <span>Copy link</span>
                      </button>
                      ${canMutate
                        ? html`<button class="default-viewer-btn edit-btn ${this.id}-edit-btn">
                              <i class="fa-solid fa-edit"></i>
                              <span>Edit</span>
                            </button>
                            <button class="default-viewer-btn ${this.id}-delete-btn" style="background: #dc3545;">
                              <i class="fa-solid fa-trash"></i>
                              <span>Delete</span>
                            </button>`
                        : ''}
                    </div>
                  </div>
                </div>

                ${dynamicCol({
                  containerSelector: this.id,
                  id: columns,
                  type: 'a-33-b-33-c-33',
                  limit: 800,
                })}
                <div class="viewer-columns">
                  <div class="viewer-column ${columns}-col-a">
                    <div class="control-group" style="margin-bottom: 20px;">
                      <h4><i class="fa-solid fa-fingerprint"></i> Identity</h4>
                      ${objectLayer.cid
                        ? html`<div class="ipfs-cid-label">
                            <i class="fa-solid fa-cube"></i>
                            <strong>Object Layer CID:</strong>
                            <span class="ipfs-cid-value">${objectLayer.cid}</span>
                          </div>`
                        : ''}
                      ${objectLayer.data.render?.cid
                        ? html`<div class="ipfs-cid-label">
                            <i class="fa-solid fa-image"></i>
                            <strong>Atlas IPFS CID:</strong>
                            <span class="ipfs-cid-value">${objectLayer.data.render.cid}</span>
                          </div>`
                        : ''}
                      ${objectLayer.data.render?.metadataCid
                        ? html`<div class="ipfs-cid-label">
                            <i class="fa-solid fa-file-code"></i>
                            <strong>Atlas Metadata CID:</strong>
                            <span class="ipfs-cid-value">${objectLayer.data.render.metadataCid}</span>
                          </div>`
                        : ''}
                      ${objectLayer.contentHash
                        ? html`<div class="ipfs-cid-label">
                            <i class="fa-solid fa-fingerprint"></i>
                            <strong>Content hash:</strong>
                            <span class="ipfs-cid-value">${objectLayer.contentHash}</span>
                          </div>`
                        : ''}
                      ${objectLayer.profile
                        ? html`<div class="ipfs-cid-label">
                            <i class="fa-solid fa-tag"></i>
                            <strong>Profile:</strong>
                            <span class="ipfs-cid-value">${objectLayer.profile.id}@${objectLayer.profile.version}</span>
                          </div>`
                        : ''}
                    </div>

                    <div class="control-group" style="margin-bottom: 20px;">
                      <h4><i class="fa-solid fa-chart-bar"></i> Stats Data</h4>
                      <div
                        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 15px; padding: 10px 0;"
                      >
                        ${Object.keys(stats).length > 0
                          ? Object.entries(stats)
                              .map(([statKey, statValue]) => {
                                const statInfo = statDescriptions[statKey] || { title: statKey, description: '', detail: '' };
                                return html`
                                  <div class="item-stat-entry">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                      ${statInfo.icon
                                        ? html`<img
                                            src="${getProxyPath()}assets/ui-icons/${statInfo.icon}"
                                            style="width: 40px; height: 40px; image-rendering: pixelated;"
                                          />`
                                        : ''}
                                      <span class="item-data-key-label">${statInfo.title}</span>
                                    </div>
                                    <span class="item-data-value-label" style="color: ${statValue < 0 ? '#ef7777' : statValue > 0 ? '#7bdd9a' : '#aaa'}">${statValue > 0 ? '+' : ''}${statValue}</span>
                                  </div>
                                `;
                              })
                              .join('')
                          : html`<div class="no-data-container">No stats data available</div>`}
                      </div>
                    </div>

                    <div class="control-group" style="margin-bottom: 20px;">
                      <h4><i class="fa-solid fa-link"></i> Ledger</h4>
                      <div class="object-layer-viewer-ledger">${this.ledgerHtml()}</div>
                    </div>
                  </div>
                  <div class="viewer-column ${columns}-col-b">
                    <div class="webp-display-area">
                      <button class="webp-download-btn" ${!this.data.webp ? 'disabled' : ''}>
                        <i class="fa-solid fa-download"></i>
                        <span>WebP</span>
                      </button>
                      <div class="webp-canvas-container chess in">
                        ${!this.data.webp
                          ? html`
                              <div class="webp-placeholder">
                                <img src="${getProxyPath()}assets/ui-icons/empty-render.png" alt="" />
                                <p>
                                  ${this.data.objectLayer?.data?.render?.cid
                                    ? 'WebP preview will appear here'
                                    : 'This definition names no render yet'}
                                </p>
                              </div>
                            `
                          : ''}
                        <div class="loading-overlay" style="display: none;">
                          <div>
                            <i class="fa-solid fa-spinner fa-spin"></i>
                            <span style="margin-left: 10px;">Generating WebP...</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="controls-container">
                      <div class="control-group">
                        <h4><i class="fa-solid fa-compass"></i> Direction</h4>
                        <div class="button-group">
                          <button
                            class="control-btn ${this.data.currentDirection === 'up' ? 'active' : ''}"
                            data-direction="up"
                            ${!hasFrames('up', this.data.currentMode) ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-arrow-up"></i>
                            <span>Up</span>
                            ${hasFrames('up', this.data.currentMode)
                              ? html`<span class="frame-count"
                                  >(${getFrameCount('up', this.data.currentMode)})</span
                                >`
                              : ''}
                          </button>
                          <button
                            class="control-btn ${this.data.currentDirection === 'down' ? 'active' : ''}"
                            data-direction="down"
                            ${!hasFrames('down', this.data.currentMode) ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-arrow-down"></i>
                            <span>Down</span>
                            ${hasFrames('down', this.data.currentMode)
                              ? html`<span class="frame-count"
                                  >(${getFrameCount('down', this.data.currentMode)})</span
                                >`
                              : ''}
                          </button>
                          <button
                            class="control-btn ${this.data.currentDirection === 'left' ? 'active' : ''}"
                            data-direction="left"
                            ${!hasFrames('left', this.data.currentMode) ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-arrow-left"></i>
                            <span>Left</span>
                            ${hasFrames('left', this.data.currentMode)
                              ? html`<span class="frame-count"
                                  >(${getFrameCount('left', this.data.currentMode)})</span
                                >`
                              : ''}
                          </button>
                          <button
                            class="control-btn ${this.data.currentDirection === 'right' ? 'active' : ''}"
                            data-direction="right"
                            ${!hasFrames('right', this.data.currentMode) ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-arrow-right"></i>
                            <span>Right</span>
                            ${hasFrames('right', this.data.currentMode)
                              ? html`<span class="frame-count"
                                  >(${getFrameCount('right', this.data.currentMode)})</span
                                >`
                              : ''}
                          </button>
                        </div>
                      </div>

                      <div class="control-group">
                        <h4><i class="fa-solid fa-person-running"></i> Mode</h4>
                        <div class="button-group">
                          <button
                            class="control-btn ${this.data.currentMode === 'idle' ? 'active' : ''}"
                            data-mode="idle"
                            ${!hasFrames(this.data.currentDirection, 'idle') ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-user"></i>
                            <span>Idle</span>
                            ${hasFrames(this.data.currentDirection, 'idle')
                              ? html`<span class="frame-count"
                                  >(${getFrameCount(this.data.currentDirection, 'idle')})</span
                                >`
                              : ''}
                          </button>
                          <button
                            class="control-btn ${this.data.currentMode === 'walking' ? 'active' : ''}"
                            data-mode="walking"
                            ${!hasFrames(this.data.currentDirection, 'walking') ? 'disabled' : ''}
                          >
                            <i class="fa-solid fa-person-walking"></i>
                            <span>Walking</span>
                            ${hasFrames(this.data.currentDirection, 'walking')
                              ? html`<span class="frame-count"
                                  >(${getFrameCount(this.data.currentDirection, 'walking')})</span
                                >`
                              : ''}
                          </button>
                        </div>
                      </div>
                      <div class="control-group">
                        <h4><i class="fa-solid fa-code"></i> Code</h4>
                        <output class="viewer-direction-code" aria-live="polite"
                          >${ObjectLayerViewer.getDirectionCode(this.data.currentDirection, this.data.currentMode) || '—'}</output
                        >
                      </div>
                    </div>
                  </div>
                  <div class="viewer-column ${columns}-col-c">
                    <div class="control-group viewer-atlas-panel" style="margin-bottom: 20px;">
                      <h4><i class="fa-solid fa-file-image"></i> Atlas Sprite Sheet</h4>
                      <div class="button-group" style="flex-direction: column; align-items: flex-start;">
                        ${this.data.render
                          ? html`
                          <div class="atlas-preview-container">
                            ${atlasRender({ label: 'Primary render', upscaled: false, native: true })}
                            ${atlasRender({ label: 'Upscaled render', upscaled: true })}
                            <div class="atlas-metadata-grid">
                              <div style="grid-column: 1 / -1;">
                                <p style="padding: 2px"><strong class="item-data-key-label">Render CID:</strong></p>
                                <p class="ipfs-cid-value" style="padding: 2px;">
                                  ${this.data.render.renderCid}
                                </p>
                              </div>
                              <div style="grid-column: 1 / -1;">
                                <p style="padding: 2px"><strong class="item-data-key-label">Metadata CID:</strong></p>
                                <p class="ipfs-cid-value" style="padding: 2px;">
                                  ${this.data.render.metadataCid}
                                </p>
                              </div>
                              <div>
                                <p style="padding: 2px"><strong class="item-data-key-label">Item Key:</strong></p>
                                <p style="padding: 2px">${this.data.render.layout.itemKey}</p>
                              </div>
                            </div>
                          </div>
                          <div class="atlas-actions-grid">
                            ${
                              canMutate
                                ? html`<button class="default-viewer-btn ${this.id}-generate-atlas-btn">
                                    <i class="fa-solid fa-sync"></i>
                                    <span>Update</span>
                                  </button>`
                                : ''
                            }
                            <button class="default-viewer-btn download-atlas-png-btn">
                              <i class="fa-solid fa-download"></i>
                              <span>PNG</span>
                            </button>
                            <button class="default-viewer-btn download-atlas-json-btn">
                              <i class="fa-solid fa-code"></i>
                              <span>JSON</span>
                            </button>
                            ${
                              canMutate
                                ? html`<button
                                    class="default-viewer-btn ${this.id}-remove-atlas-btn"
                                    style="background: #dc3545;"
                                  >
                                    <i class="fa-solid fa-trash"></i>
                                    <span>Remove</span>
                                  </button>`
                                : ''
                            }
                          </div>
                        `
                          : html`
                              <p>
                                ${this.data.renderUnavailable
                                  ? `The render is unavailable: ${escapeHtml(this.data.renderUnavailable)}`
                                  : 'This definition names no render yet.'}
                              </p>
                              ${canMutate
                                ? html`<button class="default-viewer-btn ${this.id}-generate-atlas-btn">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                                    <span>Generate Atlas</span>
                                  </button>`
                                : ''}
                            `}
                      </div>
                    </div>
                  </div>
                </div>
                <section class="control-group viewer-context hide">
                  <h4>${contextIcon()} Foundation context</h4>
                  <div class="viewer-context-panel"></div>
                </section>
                <footer class="control-group viewer-metadata-footer">
                  <h4><i class="fa-solid fa-code"></i> Metadata JSON</h4>
                  <div class="metadata-json-editor-container"></div>
                </footer>
              `}
        </div>
      `,
    );
    this.mountContext();
    // Attach event listeners
    this.attachEventListeners();
    // If we already have a webp loaded, display it without re-generating
    if (this.data.webp) {
      this.displayWebp();
    }
    // Initialize metadata JSON editor
    this.initMetadataJsonEditor();
  }
  async displayWebp() {
    const { webp, webpMetadata } = this.data;
    if (!webp || !webpMetadata) return;
    const { frameCount, frameDuration, currentDirection, currentMode } = webpMetadata;
    const container = this.el('.webp-canvas-container');
    if (!container) return;
    // Remove one-time placeholder without destroying the rest of the container
    // (clearing innerHTML would also destroy the loading overlay, breaking showLoading)
    const placeholder = container.querySelector('.webp-placeholder');
    if (placeholder) placeholder.remove();
    // Reuse the existing <img> element or create one — never nuke the container
    let img = container.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'WebP Animation';
      // Insert before the loading overlay so the overlay stays on top
      const overlay = container.querySelector('.loading-overlay');
      container.insertBefore(img, overlay || null);
    }
    img.src = webp;
    // Update info badge in-place or create it once
    const displayArea = this.el('.webp-display-area');
    if (displayArea) {
      let infoBadge = displayArea.querySelector('.webp-info-badge');
      if (!infoBadge) {
        infoBadge = document.createElement('div');
        infoBadge.className = 'webp-info-badge';
        displayArea.appendChild(infoBadge);
      }
      infoBadge.innerHTML = html`
        <span class="info-label" style="margin-left: 8px;">Frames:</span>
        <span>${frameCount}</span><br />
        <span class="info-label" style="margin-left: 8px;">Duration:</span>
        <span>${frameDuration}ms</span><br />
        <span class="info-label" style="margin-left: 8px;">Direction:</span>
        <span>${currentDirection}</span><br />
        <span class="info-label" style="margin-left: 8px;">Mode:</span>
        <span>${currentMode}</span>
      `;
    }
  }
  initMetadataJsonEditor() {
    const container = this.el('.metadata-json-editor-container');
    if (!container) return;
    // Ensure vanilla-jsoneditor dark theme CSS is loaded
    if (!s('.jse-dark-theme-link')) {
      append(
        'head',
        html`<link
          class="jse-dark-theme-link"
          rel="stylesheet"
          type="text/css"
          href="${getProxyPath()}styles/vanilla-jsoneditor/jse-theme-dark.css"
        />`,
      );
    }
    // Destroy previous instance if any
    if (this.data.metadataJsonEditor) {
      this.data.metadataJsonEditor.destroy();
      this.data.metadataJsonEditor = null;
    }
    const { objectLayer } = this.data;
    if (!objectLayer) return;
    try {
      this.data.metadataJsonEditor = createJSONEditor({
        target: container,
        props: {
          content: { json: objectLayer },
          readOnly: true,
          mainMenuBar: true,
          navigationBar: true,
          statusBar: true,
          mode: 'tree',
        },
      });
      // Apply dark theme class based on current theme
      this.applyJsonEditorTheme();
      // Register theme event to toggle dark/light on the JSON editor
      ThemeEvents[`${this.id}-json-editor`] = () => {
        this.applyJsonEditorTheme();
      };
    } catch (err) {
      logger.warn('Failed to initialize metadata JSON editor:', err);
      container.innerHTML = html`<div style="padding: 20px; color: #999; text-align: center;">
        Failed to load metadata JSON
      </div>`;
    }
  }
  applyJsonEditorTheme() {
    const container = this.el('.metadata-json-editor-container');
    if (!container) return;
    if (darkTheme) {
      container.classList.add('jse-theme-dark');
    } else {
      container.classList.remove('jse-theme-dark');
    }
  }
  async deleteObjectLayer() {
    const objectLayerId = this.data.objectLayer?._id;
    if (!objectLayerId) return;
    const itemId = this.data.objectLayer?.data?.item?.id || objectLayerId;
    const confirmResult = await Modal.RenderConfirm({
      id: 'delete-object-layer-confirm',
      html: async () => html`
        <div class="in section-mp" style="text-align: center">
          <p>Remove object layer <strong>"${itemId}"</strong> from this host?</p>
          <p style="color: #dc3545; font-size: 13px; margin-top: 8px;">
            This unbinds the label and removes this host's copy: render frames, atlas and static asset files. A
            published definition stays at the Object Layer authority under its CID.
          </p>
        </div>
      `,
    });
    if (confirmResult.status !== 'confirm') return;
    try {
      const result = await ObjectLayerService.delete({ id: objectLayerId });
      if (result.status === 'success') {
        AtlasSpriteSheetService.invalidateIdlePreview(itemId);
        NotificationManager.Push({
          html: `Object layer "${itemId}" removed from this host`,
          status: 'success',
        });
        await ObjectLayerManagement.reloadTables();
        s(`.btn-close-${this.idModal}`).click();
      } else {
        throw new Error(result.message || 'Failed to delete object layer');
      }
    } catch (error) {
      logger.error('Error deleting object layer:', error);
      NotificationManager.Push({
        html: `Failed to delete object layer: ${error.message}`,
        status: 'error',
      });
    }
  }
  attachEventListeners() {
    // Direction buttons
    const directionButtons = this.els('[data-direction]');
    directionButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const direction = e.currentTarget.getAttribute('data-direction');
        if (direction !== this.data.currentDirection) {
          this.data.currentDirection = direction;
          // Update button active states without re-rendering the full viewer (prevents flicker)
          this.updateControlsState();
          await this.generateWebp();
        }
      });
    });
    // Mode buttons
    const modeButtons = this.els('[data-mode]');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const mode = e.currentTarget.getAttribute('data-mode');
        if (mode !== this.data.currentMode) {
          this.data.currentMode = mode;
          // Update button active states without re-rendering the full viewer (prevents flicker)
          this.updateControlsState();
          await this.generateWebp();
        }
      });
    });
    // Download button
    const downloadBtn = this.el('.webp-download-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadWebp();
      });
    }
    // EventsUI names its spinner after the selector, so each of these buttons has a class of its own.
    EventsUI.onClick(`.${this.id}-copy-link-btn`, async () => {
      await copyData(`${location.origin}${publicRoutePath(VIEW_ROUTE, this.cid)}`);
      NotificationManager.Push({ html: Translate.instance('link-copied'), status: 'success' });
    });
    EventsUI.onClick(`.${this.id}-edit-btn`, () => this.toEngine());
    EventsUI.onClick(`.${this.id}-delete-btn`, () => this.deleteObjectLayer());
    EventsUI.onClick(`.${this.id}-generate-atlas-btn`, () => this.generateAtlas());
    EventsUI.onClick(`.${this.id}-remove-atlas-btn`, () => this.removeAtlas());
    const downloadAtlasPngBtn = this.el('.download-atlas-png-btn');
    if (downloadAtlasPngBtn) {
      downloadAtlasPngBtn.addEventListener('click', () => {
        const { objectLayer, render } = this.data;
        const a = document.createElement('a');
        a.href = AtlasSpriteSheetService.renderUrl({ cid: objectLayer.cid });
        a.download = `${render.layout.itemKey}-render.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
    const downloadAtlasJsonBtn = this.el('.download-atlas-json-btn');
    if (downloadAtlasJsonBtn) {
      downloadAtlasJsonBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(this.data.render.layout, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.data.render.layout.itemKey}-render-metadata.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }
  async generateAtlas() {
    const objectLayerId = this.data.objectLayer._id;
    this.data.isGeneratingAtlas = true;
    await this.renderViewer();
    try {
      const { status, data, message } = await AtlasSpriteSheetService.generateAtlas({ id: objectLayerId });
      if (status === 'success') {
        AtlasSpriteSheetService.invalidateIdlePreview(this.data.objectLayer.data.item.id);
        NotificationManager.Push({
          html: 'Atlas sprite sheet generated successfully',
          status: 'success',
        });
        // Reset generating flag before reload so renderViewer shows updated content
        this.data.isGeneratingAtlas = false;
        await this.load({ skipWebp: true });
        return;
      } else {
        throw new Error(message || 'Failed to generate atlas');
      }
    } catch (error) {
      logger.error('Error generating atlas:', error);
      NotificationManager.Push({
        html: `Failed to generate atlas: ${error.message}`,
        status: 'error',
      });
    } finally {
      if (this.data.isGeneratingAtlas) {
        this.data.isGeneratingAtlas = false;
        await this.renderViewer();
      }
    }
  }
  async removeAtlas() {
    const confirmResult = await Modal.RenderConfirm({
      id: 'remove-atlas-confirm',
      html: async () => html`
        <div class="in section-mp" style="text-align: center">
          <p>Are you sure you want to remove the atlas sprite sheet?</p>
        </div>
      `,
    });
    if (confirmResult.status !== 'confirm') {
      return;
    }
    const objectLayerId = this.data.objectLayer._id;
    this.data.isGeneratingAtlas = true;
    await this.renderViewer();
    try {
      const { status, message } = await AtlasSpriteSheetService.deleteByObjectLayerId({ id: objectLayerId });
      if (status === 'success') {
        AtlasSpriteSheetService.invalidateIdlePreview(this.data.objectLayer.data.item.id);
        NotificationManager.Push({
          html: 'Atlas sprite sheet removed successfully',
          status: 'success',
        });
        // Reset generating flag before reload so renderViewer shows updated content
        this.data.isGeneratingAtlas = false;
        await this.load({ skipWebp: true });
        return;
      } else {
        throw new Error(message || 'Failed to remove atlas');
      }
    } catch (error) {
      logger.error('Error removing atlas:', error);
      NotificationManager.Push({
        html: `Failed to remove atlas: ${error.message}`,
        status: 'error',
      });
    } finally {
      if (this.data.isGeneratingAtlas) {
        this.data.isGeneratingAtlas = false;
        await this.renderViewer();
      }
    }
  }
  async generateWebp() {
    const { objectLayer, frameCounts, currentDirection, currentMode } = this.data;
    if (!objectLayer || !frameCounts) return;
    // The generation in flight for this definition picks up a newer direction or mode when it ends.
    if (this.data.generating === objectLayer) return;
    // Get numeric direction code
    const numericCode = ObjectLayerViewer.getDirectionCode(currentDirection, currentMode);
    if (!numericCode) {
      NotificationManager.Push({
        html: `Invalid direction/mode combination: ${currentDirection} ${currentMode}`,
        status: 'error',
      });
      return;
    }
    const frameCount = frameCounts[numericCode];
    if (!frameCount || frameCount === 0) {
      NotificationManager.Push({
        html: `No frames available for ${currentDirection} ${currentMode}`,
        status: 'warning',
      });
      return;
    }
    const { frameDuration } = this.data;
    this.data.generating = objectLayer;
    this.showLoading(true, 'Generating WebP...');
    try {
      const { status, data, message } = await AtlasSpriteSheetService.getAnimation({
        cid: objectLayer.cid,
        directionCode: numericCode,
      });
      // A reload replaced the definition while the animation loaded.
      if (this.data.objectLayer !== objectLayer) return;
      if (status === 'success' && data) {
        // Store the blob URL and metadata
        this.data.webp = data;
        this.data.webpMetadata = {
          frameCount,
          frameDuration,
          currentDirection,
          currentMode,
          numericCode,
        };
        // Display the WebP in the viewer
        await this.displayWebp();
      } else {
        throw new Error(message || 'the Object Layer service answered no animation');
      }
    } catch (error) {
      logger.error('Error generating WebP:', error);
      if (this.data.objectLayer === objectLayer)
        NotificationManager.Push({
          html: `Failed to generate WebP: ${error.message}`,
          status: 'error',
        });
    } finally {
      if (this.data.generating === objectLayer) {
        this.data.generating = null;
        this.showLoading(false);
      }
    }
    const { currentDirection: direction, currentMode: mode } = this.data;
    if (
      this.data.objectLayer === objectLayer &&
      ObjectLayerViewer.getDirectionCode(direction, mode) !== numericCode
    )
      await this.generateWebp();
  }
  /**
   * Updates direction/mode button active states and disabled flags in-place,
   * without re-rendering the viewer. Prevents layout flicker when switching
   * direction or mode while the WebP canvas and surrounding structure stay intact.
   */
  updateControlsState() {
    const { currentDirection, currentMode, frameCounts } = this.data;
    const code = this.el('.viewer-direction-code');
    if (code) code.textContent = ObjectLayerViewer.getDirectionCode(currentDirection, currentMode) || '—';
    const hasFrames = (direction, mode) => {
      const code = ObjectLayerViewer.getDirectionCode(direction, mode);
      return !!(code && frameCounts && frameCounts[code] && frameCounts[code] > 0);
    };
    const getFrameCount = (direction, mode) => {
      const code = ObjectLayerViewer.getDirectionCode(direction, mode);
      return code ? (frameCounts && frameCounts[code]) || 0 : 0;
    };
    this.els('[data-direction]').forEach((btn) => {
      const d = btn.getAttribute('data-direction');
      btn.classList.toggle('active', d === currentDirection);
      const hasFr = hasFrames(d, currentMode);
      btn.disabled = !hasFr;
      const countEl = btn.querySelector('.frame-count');
      if (countEl) countEl.textContent = hasFr ? `(${getFrameCount(d, currentMode)})` : '';
    });
    this.els('[data-mode]').forEach((btn) => {
      const m = btn.getAttribute('data-mode');
      btn.classList.toggle('active', m === currentMode);
      const hasFr = hasFrames(currentDirection, m);
      btn.disabled = !hasFr;
      const countEl = btn.querySelector('.frame-count');
      if (countEl) countEl.textContent = hasFr ? `(${getFrameCount(currentDirection, m)})` : '';
    });
  }
  showLoading(show, message = 'Generating WebP...') {
    const overlay = this.el('.loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
      const loadingText = overlay.querySelector('span');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }
    const downloadBtn = this.el('.webp-download-btn');
    if (downloadBtn) {
      downloadBtn.disabled = show || !this.data.webp;
    }
    // Keep existing info badge visible during loading (removes the layout-shift flicker)
  }
  downloadWebp() {
    if (!this.data.webp) {
      NotificationManager.Push({
        html: 'No WebP available to download',
        status: 'warning',
      });
      return;
    }
    const { objectLayer, currentDirection, currentMode } = this.data;
    const numericCode = ObjectLayerViewer.getDirectionCode(currentDirection, currentMode);
    const filename = `${objectLayer.data.item.id}_${currentDirection}_${currentMode}_${numericCode}.webp`;
    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = this.data.webp;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    NotificationManager.Push({
      html: `WebP downloaded: ${filename}`,
      status: 'success',
    });
  }
  async toEngine() {
    const cid = this.data.objectLayer?.cid;
    if (!cid) return;
    // Loaded on demand: a read-only host ships the viewer without the editor.
    const { ObjectLayerEngineModal } = await import('./ObjectLayerEngineModal.js');
    ObjectLayerEngineModal.open({ cid });
  }
}
export { ObjectLayerEngineViewer };
