import { loggerFactory } from '../core/Logger.js';
import {
  getProxyPath,
  listenQueryPathInstance,
  listenQueryParamsChange,
  getQueryParams,
  setPath,
  setQueryParams,
} from '../core/Router.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { AtlasSpriteSheetService } from '../../services/atlas-sprite-sheet/atlas-sprite-sheet.service.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { append, htmls, s } from '../core/VanillaJs.js';
import { darkTheme, ThemeEvents, subThemeManager, lightenHex, darkenHex } from '../core/Css.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';
import { ObjectLayerEngineModal } from './ObjectLayerEngineModal.js';
import { Modal } from '../core/Modal.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { AgGrid } from '../core/AgGrid.js';
import { EventsUI } from '../core/EventsUI.js';
import { createJSONEditor } from 'vanilla-jsoneditor';
const logger = loggerFactory(import.meta);
class ObjectLayerEngineViewer {
  static Data = {
    objectLayer: null,
    frameCounts: null,
    currentDirection: 'down',
    currentMode: 'idle',
    webp: null,
    isGenerating: false,
    currentObjectId: undefined, // Track current loaded object layer id to prevent unnecessary reloads
    atlasSpriteSheet: null,
    isGeneratingAtlas: false,
    webpMetadata: null,
    metadataJsonEditor: null,
  };
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
  static async instance({ appStore }) {
    const id = 'object-layer-engine-viewer';
    // Reset currentObjectId when modal is rendered to ensure Reload triggers properly
    ObjectLayerEngineViewer.Data.currentObjectId = undefined;
    Modal.Data[`modal-${id}`].onReloadModalListener[id] = async () => {
      ObjectLayerEngineViewer.Reload({ appStore });
    };
    // Listen for query parameter changes for smooth navigation
    listenQueryParamsChange({
      id: `${id}-query-listener`,
      event: async (queryParams) => {
        const objectId = queryParams.id || null;
        if (!s(`.modal-${id}`) || !s(`#${id}`)) {
          logger.warn('ObjectLayerEngineViewer DOM not ready for query param change');
          return;
        }
        // Only reload if object id actually changed (normalize undefined to null for comparison)
        if (objectId !== ObjectLayerEngineViewer.Data.currentObjectId) {
          await ObjectLayerEngineViewer.Reload({ appStore });
        }
      },
    });
    return html`
      <div class="fl">
        <div class="in ${id}" id="${id}">
          <div class="in section-mp">
            <div class="in">Loading object layer...</div>
          </div>
        </div>
      </div>
    `;
  }
  static async renderEmpty({ appStore }) {
    const id = 'object-layer-engine-viewer';
    const idModal = 'modal-object-layer-engine-viewer';
    // Check if DOM element exists
    if (!s(`#${id}`)) {
      logger.warn('ObjectLayerEngineViewer DOM not ready for renderEmpty');
      return;
    }
    // Clear current object id when rendering empty state
    ObjectLayerEngineViewer.Data.currentObjectId = null;
    // Check if the management table grid already exists AND its DOM is still present
    // If it does, don't re-render (just let DefaultManagement's RouterEvents handle URL changes)
    const gridId = `object-layer-engine-management-grid-${idModal}`;
    const gridExists = AgGrid.grids[gridId];
    const gridDomExists = s(`.${gridId}`);
    if (gridExists && gridDomExists) {
      // Grid already exists with DOM intact, no need to destroy and recreate it
      // The DefaultManagement RouterEvents listener will handle pagination/filter updates
      return;
    }
    // Grid doesn't exist or its DOM was destroyed, render/re-render it
    if (gridExists && !gridDomExists) {
      // Clean up orphaned grid reference
      AgGrid.grids[gridId].destroy();
      delete AgGrid.grids[gridId];
    }
    htmls(
      `#${id}`,
      await ObjectLayerManagement.instance({
        appStore,
        idModal,
      }),
    );
  }
  static async loadObjectLayer(objectLayerId, appStore, options = {}) {
    const { skipWebp = false } = options;
    const id = 'object-layer-engine-viewer';
    // Check if DOM element exists
    if (!s(`#${id}`)) {
      logger.warn('ObjectLayerEngineViewer DOM not ready for loadObjectLayer');
      return;
    }
    try {
      // Load metadata first
      const { status: metaStatus, data: metadata } = await ObjectLayerService.getMetadata({ id: objectLayerId });
      if (metaStatus !== 'success' || !metadata) {
        throw new Error('Failed to load object layer metadata');
      }
      ObjectLayerEngineViewer.Data.objectLayer = metadata;
      if (metadata.atlasSpriteSheetId) {
        const { status: atlasStatus, data: atlasData } = await AtlasSpriteSheetService.get({
          id: metadata.atlasSpriteSheetId,
        });
        if (atlasStatus === 'success') {
          ObjectLayerEngineViewer.Data.atlasSpriteSheet = atlasData;
        }
      } else {
        ObjectLayerEngineViewer.Data.atlasSpriteSheet = null;
      }
      // Load frame counts for all directions
      const { status: frameStatus, data: frameData } = await ObjectLayerService.getFrameCounts({ id: objectLayerId });
      if (frameStatus !== 'success' || !frameData) {
        throw new Error('Failed to load frame counts');
      }
      ObjectLayerEngineViewer.Data.frameCounts = frameData.frameCounts;
      // Priority order for directions
      const directions = ['down', 'up', 'left', 'right'];
      // Priority order for modes
      const modes = ['idle', 'walking'];
      ObjectLayerEngineViewer.Data.currentDirection = 'down';
      ObjectLayerEngineViewer.Data.currentMode = 'idle';
      // instance the viewer UI
      await ObjectLayerEngineViewer.renderViewer({ appStore });
      // Generate WebP
      if (!skipWebp) {
        await ObjectLayerEngineViewer.generateWebp();
      }
    } catch (error) {
      logger.error('Error loading object layer:', error);
      NotificationManager.Push({
        html: `Failed to load object layer: ${error.message}`,
        status: 'error',
      });
      htmls(
        `#${id}`,
        html`
          <div class="in section-mp">
            <div class="in">
              <h3>Error</h3>
              <p>Failed to load object layer. Please try again.</p>
            </div>
          </div>
        `,
      );
    }
  }
  static async renderViewer({ appStore }) {
    const id = 'object-layer-engine-viewer';
    const { objectLayer, frameCounts } = ObjectLayerEngineViewer.Data;
    if (!objectLayer || !frameCounts) return;
    // Check if DOM element exists
    if (!s(`#${id}`)) {
      logger.warn('ObjectLayerEngineViewer DOM not ready for renderViewer');
      return;
    }
    const itemType = objectLayer.data.item.type;
    const itemId = objectLayer.data.item.id;
    const itemDescription = objectLayer.data.item.description || '';
    const itemActivable = objectLayer.data.item.activable || false;
    // Get ledger data
    const ledger = objectLayer.data.ledger || {};
    const ledgerType = ledger.type || '';
    const ledgerAddress = ledger.address || '';
    // Get stats data
    const stats = objectLayer.data.stats || {};
    // Helper function to check if direction/mode has frames
    const hasFrames = (direction, mode) => {
      const numericCode = ObjectLayerEngineViewer.getDirectionCode(direction, mode);
      return numericCode && frameCounts[numericCode] && frameCounts[numericCode] > 0;
    };
    // Helper function to get frame count
    const getFrameCount = (direction, mode) => {
      const numericCode = ObjectLayerEngineViewer.getDirectionCode(direction, mode);
      return numericCode ? frameCounts[numericCode] || 0 : 0;
    };
    ThemeEvents[id] = () => {
      if (!s(`.style-${id}`)) return;
      htmls(
        `.style-${id}`,
        html` <style>
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
          .webp-placeholder i {
            font-size: 48px;
            opacity: 0.3;
            margin-bottom: 16px;
          }
          .webp-placeholder p {
            margin: 0;
            font-size: 14px;
          }
          .object-layer-viewer-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-family: 'retro-font';
          }

          .viewer-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid ${darkTheme ? '#444' : '#ddd'};
          }

          .viewer-header h2 {
            margin: 0 0 10px 0;
            color: ${darkTheme ? '#fff' : '#333'};
          }

          .webp-display-area {
            background: ${darkTheme ? '#2a2a2a' : '#f5f5f5'};
            border: 2px solid ${darkTheme ? '#444' : '#ddd'};
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 300px;
            height: auto;
            max-height: 600px;
            position: relative;
            overflow: auto;
          }

          .webp-canvas-container {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
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
            padding: 15px 20px;
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

          .default-viewer-btn:hover {
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
              max-height: 500px;
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
              max-height: 400px;
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
        </style>`,
      );
    };
    htmls(
      `#${id}`,
      html`
        <div class="hide style-${id}"></div>

        <div class="object-layer-viewer-container">
          ${ObjectLayerEngineViewer.Data.isGeneratingAtlas
            ? html`
                <div
                  style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 500px; gap: 20px; text-align: center;"
                >
                  <i class="fa-solid fa-spinner fa-spin" style="font-size: 30px;"></i>
                  Generating Atlas Sprite Sheet
                </div>
              `
            : html`
                <!-- Item Data Section -->
                <div class="control-group" style="margin-bottom: 20px;">
                  <h4><i class="fa-solid fa-cube"></i> Item Data</h4>
                  <div
                    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px 0;"
                  >
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <span class="item-data-key-label">Item ID</span>
                      <span style="font-weight: 600;">${itemId}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <span class="item-data-key-label">Type</span>
                      <span style="font-weight: 600;">${itemType}</span>
                    </div>
                    ${itemDescription
                      ? html`<div style="display: flex; flex-direction: column; gap: 4px;">
                          <span class="item-data-key-label">Description</span>
                          <span style="font-weight: 600;">${itemDescription}</span>
                        </div>`
                      : ''}
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <span class="item-data-key-label">Activable</span>
                      <span style="font-weight: 600;">${itemActivable ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                  ${objectLayer.cid
                    ? html`<div class="ipfs-cid-label">
                        <i class="fa-solid fa-cube"></i>
                        <strong>IPFS CID:</strong>
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
                  ${objectLayer.sha256
                    ? html`<div class="ipfs-cid-label">
                        <i class="fa-solid fa-fingerprint"></i>
                        <strong>SHA-256:</strong>
                        <span class="ipfs-cid-value">${objectLayer.sha256}</span>
                      </div>`
                    : ''}
                </div>

                <!-- Metadata JSON Section -->
                <div class="control-group" style="margin-bottom: 20px;">
                  <h4><i class="fa-solid fa-code"></i> Metadata JSON</h4>
                  <div
                    id="metadata-json-editor-container"
                    style="height: 400px; border-radius: 6px; overflow: hidden; border: 1px solid ${darkTheme
                      ? '#444'
                      : '#ddd'};"
                  ></div>
                </div>

                <!-- Stats Data Section -->
                <div class="control-group" style="margin-bottom: 20px;">
                  <h4><i class="fa-solid fa-chart-bar"></i> Stats Data</h4>
                  <div
                    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; padding: 10px 0;"
                  >
                    ${Object.keys(stats).length > 0
                      ? Object.entries(stats)
                          .map(([statKey, statValue]) => {
                            const statInfo = ObjectLayerEngineModal.statDescriptions[statKey];
                            if (!statInfo) return '';
                            return html`
                              <div class="item-stat-entry">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                  <i class="${statInfo.icon}" id="stat-icon-${statKey}-${id}"></i>
                                  <span class="item-data-key-label">${statInfo.title}</span>
                                </div>
                                <span class="item-data-value-label">${statValue}</span>
                              </div>
                            `;
                          })
                          .join('')
                      : html`<div class="no-data-container">No stats data available</div>`}
                  </div>
                </div>

                <!-- Ledger Section -->
                <div class="control-group" style="margin-bottom: 20px;">
                  <h4><i class="fa-solid fa-link"></i> Ledger</h4>
                  <div
                    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px 0;"
                  >
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <span class="item-data-key-label">Type</span>
                      <span style="font-weight: 600;">${ledgerType || 'N/A'}</span>
                    </div>
                    ${ledgerAddress
                      ? html`<div style="display: flex; flex-direction: column; gap: 4px;">
                          <span class="item-data-key-label">Contract Address</span>
                          <span style="font-weight: 600; word-break: break-all;">${ledgerAddress}</span>
                        </div>`
                      : ''}
                  </div>
                </div>

                <div class="webp-display-area">
                  <button class="webp-download-btn" id="download-webp-btn">
                    <i class="fa-solid fa-download"></i>
                    <span>WebP</span>
                  </button>
                  <div class="webp-canvas-container chess in" id="webp-canvas-container">
                    ${!ObjectLayerEngineViewer.Data.webp
                      ? html`
                          <div class="webp-placeholder">
                            <i class="fa-solid fa-image"></i>
                            <p>WebP preview will appear here</p>
                          </div>
                        `
                      : ''}
                    <div id="webp-loading-overlay" class="loading-overlay" style="display: none;">
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
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentDirection === 'up' ? 'active' : ''}"
                        data-direction="up"
                        ${!hasFrames('up', ObjectLayerEngineViewer.Data.currentMode) ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-arrow-up"></i>
                        <span>Up</span>
                        ${hasFrames('up', ObjectLayerEngineViewer.Data.currentMode)
                          ? html`<span class="frame-count"
                              >(${getFrameCount('up', ObjectLayerEngineViewer.Data.currentMode)})</span
                            >`
                          : ''}
                      </button>
                      <button
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentDirection === 'down' ? 'active' : ''}"
                        data-direction="down"
                        ${!hasFrames('down', ObjectLayerEngineViewer.Data.currentMode) ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-arrow-down"></i>
                        <span>Down</span>
                        ${hasFrames('down', ObjectLayerEngineViewer.Data.currentMode)
                          ? html`<span class="frame-count"
                              >(${getFrameCount('down', ObjectLayerEngineViewer.Data.currentMode)})</span
                            >`
                          : ''}
                      </button>
                      <button
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentDirection === 'left' ? 'active' : ''}"
                        data-direction="left"
                        ${!hasFrames('left', ObjectLayerEngineViewer.Data.currentMode) ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-arrow-left"></i>
                        <span>Left</span>
                        ${hasFrames('left', ObjectLayerEngineViewer.Data.currentMode)
                          ? html`<span class="frame-count"
                              >(${getFrameCount('left', ObjectLayerEngineViewer.Data.currentMode)})</span
                            >`
                          : ''}
                      </button>
                      <button
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentDirection === 'right' ? 'active' : ''}"
                        data-direction="right"
                        ${!hasFrames('right', ObjectLayerEngineViewer.Data.currentMode) ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-arrow-right"></i>
                        <span>Right</span>
                        ${hasFrames('right', ObjectLayerEngineViewer.Data.currentMode)
                          ? html`<span class="frame-count"
                              >(${getFrameCount('right', ObjectLayerEngineViewer.Data.currentMode)})</span
                            >`
                          : ''}
                      </button>
                    </div>
                  </div>

                  <div class="control-group">
                    <h4><i class="fa-solid fa-person-running"></i> Mode</h4>
                    <div class="button-group">
                      <button
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentMode === 'idle' ? 'active' : ''}"
                        data-mode="idle"
                        ${!hasFrames(ObjectLayerEngineViewer.Data.currentDirection, 'idle') ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-user"></i>
                        <span>Idle</span>
                        ${hasFrames(ObjectLayerEngineViewer.Data.currentDirection, 'idle')
                          ? html`<span class="frame-count"
                              >(${getFrameCount(ObjectLayerEngineViewer.Data.currentDirection, 'idle')})</span
                            >`
                          : ''}
                      </button>
                      <button
                        class="control-btn ${ObjectLayerEngineViewer.Data.currentMode === 'walking' ? 'active' : ''}"
                        data-mode="walking"
                        ${!hasFrames(ObjectLayerEngineViewer.Data.currentDirection, 'walking') ? 'disabled' : ''}
                      >
                        <i class="fa-solid fa-person-walking"></i>
                        <span>Walking</span>
                        ${hasFrames(ObjectLayerEngineViewer.Data.currentDirection, 'walking')
                          ? html`<span class="frame-count"
                              >(${getFrameCount(ObjectLayerEngineViewer.Data.currentDirection, 'walking')})</span
                            >`
                          : ''}
                      </button>
                    </div>
                  </div>

                  <div class="control-group">
                    <h4><i class="fa-solid fa-file-image"></i> Atlas Sprite Sheet</h4>
                    <div class="button-group" style="flex-direction: column; align-items: flex-start;">
                      ${ObjectLayerEngineViewer.Data.atlasSpriteSheet
                        ? html`
                        <div class="atlas-preview-container">
                          ${
                            ObjectLayerEngineViewer.Data.atlasSpriteSheet.fileId
                              ? html`
                                  <div class="atlas-img-wrapper">
                                    <img
                                      src="${getProxyPath()}api/file/blob/${ObjectLayerEngineViewer.Data
                                        .atlasSpriteSheet.fileId._id ||
                                      ObjectLayerEngineViewer.Data.atlasSpriteSheet.fileId}"
                                      class="in atlas-img-preview"
                                    />
                                  </div>
                                `
                              : html`
                                  <div class="atlas-img-wrapper">
                                    <div class="atlas-img-placeholder">Atlas image not available</div>
                                  </div>
                                `
                          }
                          <div class="atlas-metadata-grid">
                            <div>
                              <p style="padding: 2px"><strong class="item-data-key-label">ID:</strong></p>
                              <p style="padding: 2px" font-size: 12px;">${ObjectLayerEngineViewer.Data.atlasSpriteSheet._id}</p>
                            </div>
                            ${
                              ObjectLayerEngineViewer.Data.atlasSpriteSheet.cid
                                ? html`<div style="grid-column: 1 / -1;">
                                    <p style="padding: 2px"><strong class="item-data-key-label">IPFS CID:</strong></p>
                                    <p class="ipfs-cid-value" style="padding: 2px;">
                                      ${ObjectLayerEngineViewer.Data.atlasSpriteSheet.cid}
                                    </p>
                                  </div>`
                                : ''
                            }
                            <div>
                              <p style="padding: 2px"><strong class="item-data-key-label">Dimensions:</strong></p>
                              <p style="padding: 2px">
                                ${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.atlasWidth}x${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.atlasHeight}
                              </p>
                            </div>
                            <div>
                                <p style="padding: 2px"><strong class="item-data-key-label">Cell Dim:</strong></p>
                              <p style="padding: 2px">${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.cellPixelDim}px</p>
                            </div>
                            <div>
                                <p style="padding: 2px"><strong class="item-data-key-label">Item Key:</strong></p>
                              <p style="padding: 2px">${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.itemKey}</p>
                            </div>
                          </div>
                        </div>
                        <div class="atlas-actions-grid">
                          <button class="default-viewer-btn" id="generate-atlas-btn">
                            <i class="fa-solid fa-sync"></i>
                            <span>Update</span>
                          </button>
                          <button class="default-viewer-btn" id="download-atlas-png-btn">
                            <i class="fa-solid fa-download"></i>
                            <span>PNG</span>
                          </button>
                          <button class="default-viewer-btn" id="download-atlas-json-btn">
                            <i class="fa-solid fa-code"></i>
                            <span>JSON</span>
                          </button>
                          <button class="default-viewer-btn" id="remove-atlas-btn" style="background: #dc3545;">
                            <i class="fa-solid fa-trash"></i>
                            <span>Remove</span>
                          </button>
                        </div>
                      `
                        : html`
                            <p>No atlas sprite sheet associated with this object layer.</p>
                            <button class="default-viewer-btn" id="generate-atlas-btn">
                              <i class="fa-solid fa-wand-magic-sparkles"></i>
                              <span>Generate Atlas</span>
                            </button>
                          `}
                    </div>
                  </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                  <button class="default-viewer-btn" id="return-to-list-btn">
                    <i class="fa-solid fa-arrow-left"></i>
                    <span>Return to List</span>
                  </button>
                  <button class="default-viewer-btn edit-btn" id="edit-object-layer-btn">
                    <i class="fa-solid fa-edit"></i>
                    <span>Edit</span>
                  </button>
                  <button class="default-viewer-btn" id="delete-object-layer-btn" style="background: #dc3545;">
                    <i class="fa-solid fa-trash"></i>
                    <span>Delete</span>
                  </button>
                </div>
              `}
        </div>
      `,
    );
    ThemeEvents[id]();
    // Attach event listeners
    ObjectLayerEngineViewer.attachEventListeners({ appStore });
    // If we already have a webp loaded, display it without re-generating
    if (ObjectLayerEngineViewer.Data.webp) {
      ObjectLayerEngineViewer.displayWebp();
    }
    // Initialize metadata JSON editor
    ObjectLayerEngineViewer.initMetadataJsonEditor();
  }
  static async displayWebp() {
    const { webp, webpMetadata } = ObjectLayerEngineViewer.Data;
    if (!webp || !webpMetadata) return;
    const { frameCount, frameDuration, currentDirection, currentMode, numericCode } = webpMetadata;
    const container = s('#webp-canvas-container');
    if (!container) return;
    // Remove one-time placeholder without destroying the rest of the container
    // (clearing innerHTML would also destroy #webp-loading-overlay, breaking showLoading)
    const placeholder = container.querySelector('.webp-placeholder');
    if (placeholder) placeholder.remove();
    // Reuse the existing <img> element or create one — never nuke the container
    let img = container.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'WebP Animation';
      // Insert before the loading overlay so the overlay stays on top
      const overlay = container.querySelector('#webp-loading-overlay');
      container.insertBefore(img, overlay || null);
    }
    img.src = webp;
    // Update info badge in-place or create it once
    const displayArea = s('.webp-display-area');
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
        <span>${currentMode}</span><br />
        <span class="info-label" style="margin-left: 8px;">Code:</span>
        <span>${numericCode}</span>
      `;
    }
  }
  static async initMetadataJsonEditor() {
    const container = s('#metadata-json-editor-container');
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
    if (ObjectLayerEngineViewer.Data.metadataJsonEditor) {
      ObjectLayerEngineViewer.Data.metadataJsonEditor.destroy();
      ObjectLayerEngineViewer.Data.metadataJsonEditor = null;
    }
    const objectLayerId = ObjectLayerEngineViewer.Data.objectLayer?._id;
    if (!objectLayerId) return;
    try {
      const response = await ObjectLayerService.getMetadata({ id: objectLayerId });
      const metadataContent = response.status === 'success' && response.data ? response.data : response;
      ObjectLayerEngineViewer.Data.metadataJsonEditor = createJSONEditor({
        target: container,
        props: {
          content: { json: metadataContent },
          readOnly: true,
          mainMenuBar: true,
          navigationBar: true,
          statusBar: true,
          mode: 'tree',
        },
      });
      // Apply dark theme class based on current theme
      ObjectLayerEngineViewer._applyJsonEditorTheme();
      // Register theme event to toggle dark/light on the JSON editor
      ThemeEvents['metadata-json-editor-theme'] = () => {
        ObjectLayerEngineViewer._applyJsonEditorTheme();
      };
    } catch (err) {
      logger.warn('Failed to initialize metadata JSON editor:', err);
      container.innerHTML = html`<div style="padding: 20px; color: #999; text-align: center;">
        Failed to load metadata JSON
      </div>`;
    }
  }
  static _applyJsonEditorTheme() {
    const container = s('#metadata-json-editor-container');
    if (!container) return;
    if (darkTheme) {
      container.classList.add('jse-theme-dark');
    } else {
      container.classList.remove('jse-theme-dark');
    }
  }
  static async deleteObjectLayer({ appStore } = {}) {
    const objectLayerId = ObjectLayerEngineViewer.Data.objectLayer?._id;
    if (!objectLayerId) return;
    const itemId = ObjectLayerEngineViewer.Data.objectLayer?.data?.item?.id || objectLayerId;
    const confirmResult = await Modal.RenderConfirm({
      id: 'delete-object-layer-confirm',
      html: async () => html`
        <div class="in section-mp" style="text-align: center">
          <p>Are you sure you want to permanently delete object layer <strong>"${itemId}"</strong>?</p>
          <p style="color: #dc3545; font-size: 13px; margin-top: 8px;">
            This will remove all associated data including render frames, atlas sprite sheet, IPFS pins, and static
            asset files.
          </p>
        </div>
      `,
    });
    if (confirmResult.status !== 'confirm') return;
    try {
      const result = await ObjectLayerService.delete({ id: objectLayerId });
      if (result.status === 'success') {
        NotificationManager.Push({
          html: `Object layer "${itemId}" deleted successfully`,
          status: 'success',
        });
        // Clean up JSON editor and its theme event
        if (ObjectLayerEngineViewer.Data.metadataJsonEditor) {
          ObjectLayerEngineViewer.Data.metadataJsonEditor.destroy();
          ObjectLayerEngineViewer.Data.metadataJsonEditor = null;
        }
        delete ThemeEvents['metadata-json-editor-theme'];
        // Navigate back to list
        ObjectLayerEngineViewer.Data.currentObjectId = undefined;
        ObjectLayerEngineViewer.Data.objectLayer = null;
        ObjectLayerEngineViewer.Data.webp = null;
        ObjectLayerEngineViewer.Data.webpMetadata = null;
        ObjectLayerEngineViewer.Data.atlasSpriteSheet = null;
        setQueryParams({ id: null }, { replace: false });
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
  static attachEventListeners({ appStore }) {
    // Direction buttons
    const directionButtons = document.querySelectorAll('[data-direction]');
    directionButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const direction = e.currentTarget.getAttribute('data-direction');
        if (direction !== ObjectLayerEngineViewer.Data.currentDirection) {
          ObjectLayerEngineViewer.Data.currentDirection = direction;
          // Update button active states without re-rendering the full viewer (prevents flicker)
          ObjectLayerEngineViewer._updateControlsState();
          await ObjectLayerEngineViewer.generateWebp();
        }
      });
    });
    // Mode buttons
    const modeButtons = document.querySelectorAll('[data-mode]');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const mode = e.currentTarget.getAttribute('data-mode');
        if (mode !== ObjectLayerEngineViewer.Data.currentMode) {
          ObjectLayerEngineViewer.Data.currentMode = mode;
          // Update button active states without re-rendering the full viewer (prevents flicker)
          ObjectLayerEngineViewer._updateControlsState();
          await ObjectLayerEngineViewer.generateWebp();
        }
      });
    });
    // Download button
    const downloadBtn = s('#download-webp-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        ObjectLayerEngineViewer.downloadWebp();
      });
    }
    // Return to list button
    const listBtn = s('#return-to-list-btn');
    if (listBtn) {
      listBtn.addEventListener('click', async () => {
        // Clear object data and reset state
        ObjectLayerEngineViewer.Data.webp = null;
        ObjectLayerEngineViewer.Data.webpMetadata = null;
        ObjectLayerEngineViewer.Data.objectLayer = null;
        ObjectLayerEngineViewer.Data.frameCounts = null;
        // Set currentObjectId to null BEFORE setQueryParams so the
        // listenQueryParamsChange listener sees the id already matches
        // and skips calling Reload (avoids double-render race condition)
        ObjectLayerEngineViewer.Data.currentObjectId = null;
        // Update the URL to remove the id parameter
        setQueryParams({ id: null }, { replace: false });
        // Directly render the list view instead of relying on the
        // listener → Reload → renderEmpty chain which can silently
        // fail when the URL was already clean or currentObjectId
        // was already null
        await ObjectLayerEngineViewer.renderEmpty({ appStore });
      });
    }
    // Edit button
    const editBtn = s('#edit-object-layer-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        ObjectLayerEngineViewer.toEngine();
      });
    }
    // Delete button
    const deleteBtn = s('#delete-object-layer-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        await ObjectLayerEngineViewer.deleteObjectLayer({ appStore });
      });
    }
    // Atlas buttons
    if (s('#generate-atlas-btn')) {
      EventsUI.onClick('#generate-atlas-btn', async () => {
        await ObjectLayerEngineViewer.generateAtlas({ appStore });
      });
    }
    const removeAtlasBtn = s('#remove-atlas-btn');
    if (removeAtlasBtn) {
      removeAtlasBtn.addEventListener('click', async () => {
        await ObjectLayerEngineViewer.removeAtlas({ appStore });
      });
    }
    const downloadAtlasPngBtn = s('#download-atlas-png-btn');
    if (downloadAtlasPngBtn) {
      downloadAtlasPngBtn.addEventListener('click', () => {
        const fileId =
          ObjectLayerEngineViewer.Data &&
          ObjectLayerEngineViewer.Data.atlasSpriteSheet &&
          ObjectLayerEngineViewer.Data.atlasSpriteSheet.fileId
            ? ObjectLayerEngineViewer.Data.atlasSpriteSheet.fileId._id ||
              ObjectLayerEngineViewer.Data.atlasSpriteSheet.fileId
            : null;
        if (!fileId) {
          NotificationManager.Push({
            html: 'Atlas PNG file is missing. Please generate the atlas first.',
            status: 'error',
          });
          return;
        }
        const url = `${getProxyPath()}api/file/blob/${fileId}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.itemKey}-atlas.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
    const downloadAtlasJsonBtn = s('#download-atlas-json-btn');
    if (downloadAtlasJsonBtn) {
      downloadAtlasJsonBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ObjectLayerEngineViewer.Data.atlasSpriteSheet.metadata.itemKey}-atlas-metadata.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }
  static async generateAtlas({ appStore } = {}) {
    const objectLayerId = ObjectLayerEngineViewer.Data.objectLayer._id;
    ObjectLayerEngineViewer.Data.isGeneratingAtlas = true;
    await ObjectLayerEngineViewer.renderViewer({ appStore });
    try {
      const { status, data, message } = await AtlasSpriteSheetService.generateAtlas({ id: objectLayerId });
      if (status === 'success') {
        NotificationManager.Push({
          html: 'Atlas sprite sheet generated successfully',
          status: 'success',
        });
        // Reset generating flag before reload so renderViewer shows updated content
        ObjectLayerEngineViewer.Data.isGeneratingAtlas = false;
        await ObjectLayerEngineViewer.Reload({ appStore, force: true, skipWebp: true });
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
      if (ObjectLayerEngineViewer.Data.isGeneratingAtlas) {
        ObjectLayerEngineViewer.Data.isGeneratingAtlas = false;
        await ObjectLayerEngineViewer.renderViewer({ appStore });
      }
    }
  }
  static async removeAtlas({ appStore } = {}) {
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
    const objectLayerId = ObjectLayerEngineViewer.Data.objectLayer._id;
    ObjectLayerEngineViewer.Data.isGeneratingAtlas = true;
    await ObjectLayerEngineViewer.renderViewer({ appStore });
    try {
      const { status, message } = await AtlasSpriteSheetService.deleteByObjectLayerId({ id: objectLayerId });
      if (status === 'success') {
        NotificationManager.Push({
          html: 'Atlas sprite sheet removed successfully',
          status: 'success',
        });
        // Reset generating flag before reload so renderViewer shows updated content
        ObjectLayerEngineViewer.Data.isGeneratingAtlas = false;
        await ObjectLayerEngineViewer.Reload({ appStore, force: true, skipWebp: true });
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
      if (ObjectLayerEngineViewer.Data.isGeneratingAtlas) {
        ObjectLayerEngineViewer.Data.isGeneratingAtlas = false;
        await ObjectLayerEngineViewer.renderViewer({ appStore });
      }
    }
  }
  static async generateWebp() {
    if (ObjectLayerEngineViewer.Data.isGenerating) return;
    const { objectLayer, frameCounts, currentDirection, currentMode } = ObjectLayerEngineViewer.Data;
    if (!objectLayer || !frameCounts) return;
    // Get numeric direction code
    const numericCode = ObjectLayerEngineViewer.getDirectionCode(currentDirection, currentMode);
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
    const itemType = objectLayer.data.item.type;
    const itemId = objectLayer.data.item.id;
    const frameDuration = objectLayer.objectLayerRenderFramesId?.frame_duration || 100;
    ObjectLayerEngineViewer.Data.isGenerating = true;
    ObjectLayerEngineViewer.showLoading(true, 'Generating WebP...');
    try {
      // Call the WebP generation API endpoint
      const { status, data } = await ObjectLayerService.generateWebp({
        itemType,
        itemId,
        directionCode: numericCode,
      });
      if (status === 'success' && data) {
        // Store the blob URL and metadata
        ObjectLayerEngineViewer.Data.webp = data;
        ObjectLayerEngineViewer.Data.webpMetadata = {
          frameCount,
          frameDuration,
          currentDirection,
          currentMode,
          numericCode,
        };
        // Display the WebP in the viewer
        await ObjectLayerEngineViewer.displayWebp();
        // NotificationManager.Push({
        //   html: `WebP generated successfully (${frameCount} frames, ${frameDuration}ms duration)`,
        //   status: 'success',
        // });
      } else {
        throw new Error('Failed to generate WebP');
      }
      ObjectLayerEngineViewer.Data.isGenerating = false;
      ObjectLayerEngineViewer.showLoading(false);
    } catch (error) {
      logger.error('Error generating WebP:', error);
      NotificationManager.Push({
        html: `Failed to generate WebP: ${error.message}`,
        status: 'error',
      });
      ObjectLayerEngineViewer.Data.isGenerating = false;
      ObjectLayerEngineViewer.showLoading(false);
    }
  }
  /**
   * Updates direction/mode button active states and disabled flags in-place,
   * without re-rendering the viewer. Prevents layout flicker when switching
   * direction or mode while the WebP canvas and surrounding structure stay intact.
   */
  static _updateControlsState() {
    const { currentDirection, currentMode, frameCounts } = ObjectLayerEngineViewer.Data;
    const hasFrames = (direction, mode) => {
      const code = ObjectLayerEngineViewer.getDirectionCode(direction, mode);
      return !!(code && frameCounts && frameCounts[code] && frameCounts[code] > 0);
    };
    const getFrameCount = (direction, mode) => {
      const code = ObjectLayerEngineViewer.getDirectionCode(direction, mode);
      return code ? (frameCounts && frameCounts[code]) || 0 : 0;
    };
    document.querySelectorAll('[data-direction]').forEach((btn) => {
      const d = btn.getAttribute('data-direction');
      btn.classList.toggle('active', d === currentDirection);
      const hasFr = hasFrames(d, currentMode);
      btn.disabled = !hasFr;
      const countEl = btn.querySelector('.frame-count');
      if (countEl) countEl.textContent = hasFr ? `(${getFrameCount(d, currentMode)})` : '';
    });
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      const m = btn.getAttribute('data-mode');
      btn.classList.toggle('active', m === currentMode);
      const hasFr = hasFrames(currentDirection, m);
      btn.disabled = !hasFr;
      const countEl = btn.querySelector('.frame-count');
      if (countEl) countEl.textContent = hasFr ? `(${getFrameCount(currentDirection, m)})` : '';
    });
  }
  static showLoading(show, message = 'Generating WebP...') {
    const overlay = s('#webp-loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
      const loadingText = overlay.querySelector('span');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }
    const downloadBtn = s('#download-webp-btn');
    if (downloadBtn) {
      downloadBtn.disabled = show;
    }
    // Keep existing info badge visible during loading (removes the layout-shift flicker)
  }
  static downloadWebp() {
    if (!ObjectLayerEngineViewer.Data.webp) {
      NotificationManager.Push({
        html: 'No WebP available to download',
        status: 'warning',
      });
      return;
    }
    const { objectLayer, currentDirection, currentMode } = ObjectLayerEngineViewer.Data;
    const numericCode = ObjectLayerEngineViewer.getDirectionCode(currentDirection, currentMode);
    const filename = `${objectLayer.data.item.id}_${currentDirection}_${currentMode}_${numericCode}.webp`;
    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = ObjectLayerEngineViewer.Data.webp;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    NotificationManager.Push({
      html: `WebP downloaded: ${filename}`,
      status: 'success',
    });
  }
  static toEngine() {
    const { objectLayer } = ObjectLayerEngineViewer.Data;
    if (!objectLayer || !objectLayer._id) return;
    // Navigate to editor route first
    setPath(`${getProxyPath()}object-layer-engine`);
    // Then add query param without replacing history
    setQueryParams({ id: objectLayer._id }, { replace: true });
    if (s(`.modal-object-layer-engine`)) {
      ObjectLayerEngineModal.Reload();
    } else {
      s(`.main-btn-object-layer-engine`)?.click();
    }
  }
  static async Reload(options = {}) {
    const { appStore, force = false, skipWebp = false } = options;
    const queryParams = getQueryParams();
    const objectId = queryParams.id || null;
    // Only reload if object id actually changed (same logic as listener) or forced
    if (objectId !== ObjectLayerEngineViewer.Data.currentObjectId || force) {
      if (objectId !== ObjectLayerEngineViewer.Data.currentObjectId && !skipWebp) {
        ObjectLayerEngineViewer.Data.webp = null;
        ObjectLayerEngineViewer.Data.webpMetadata = null;
      }
      ObjectLayerEngineViewer.Data.currentObjectId = objectId;
      if (objectId) {
        await ObjectLayerEngineViewer.loadObjectLayer(objectId, appStore, { skipWebp });
      } else {
        await ObjectLayerEngineViewer.renderEmpty({ appStore });
      }
    } else if (!objectId && (ObjectLayerEngineViewer.Data.currentObjectId === null || force)) {
      // Special case: if we're already in empty state but DOM might have been reset
      // (e.g., modal reopened), force render the table if DOM is missing
      const id = 'object-layer-engine-viewer';
      const idModal = 'modal-object-layer-engine-viewer';
      const gridId = `object-layer-engine-management-grid-${idModal}`;
      const gridDomExists = s(`.${gridId}`);
      if (!gridDomExists) {
        // DOM was reset (e.g., modal HTML reloaded), re-render the table
        await ObjectLayerEngineViewer.renderEmpty({ appStore });
      }
    }
  }
}
export { ObjectLayerEngineViewer };
