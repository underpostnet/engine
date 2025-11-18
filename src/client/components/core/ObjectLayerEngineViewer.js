import { loggerFactory } from './Logger.js';
import { getProxyPath, listenQueryPathInstance, setPath, setQueryParams } from './Router.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { NotificationManager } from './NotificationManager.js';
import { htmls, s } from './VanillaJs.js';

import { darkTheme, ThemeEvents } from './Css.js';
import { ObjectLayerManagement } from '../../services/object-layer/object-layer.management.js';
import { ObjectLayerEngineModal } from './ObjectLayerEngineModal.js';
import { Modal } from './Modal.js';
import { DefaultManagement } from '../../services/default/default.management.js';
import { AgGrid } from './AgGrid.js';

const logger = loggerFactory(import.meta);

const ObjectLayerEngineViewer = {
  Data: {
    objectLayer: null,
    frameCounts: null,
    currentDirection: 'down',
    currentMode: 'idle',
    webp: null,
    isGenerating: false,
  },

  // Map user-friendly direction/mode to numeric direction codes
  getDirectionCode: function (direction, mode) {
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
  },

  Render: async function ({ Elements }) {
    const id = 'object-layer-engine-viewer';

    Modal.Data[`modal-${id}`].onReloadModalListener[id] = async () => {
      ObjectLayerEngineViewer.Reload({ Elements });
    };

    // Listen for cid query parameter
    listenQueryPathInstance(
      {
        id: `${id}-query-listener`,
        routeId: 'object-layer-engine-viewer',
        event: async (cid) => {
          if (cid) {
            await this.loadObjectLayer(cid, Elements);
          } else {
            this.renderEmpty({ Elements });
          }
        },
      },
      'cid',
    );

    return html`
      <div class="fl">
        <div class="in ${id}" id="${id}">
          <div class="in section-mp">
            <div class="in">Loading object layer...</div>
          </div>
        </div>
      </div>
    `;
  },

  renderEmpty: async function ({ Elements }) {
    const id = 'object-layer-engine-viewer';
    const idModal = 'modal-object-layer-engine-viewer';
    const serviceId = 'object-layer-engine-management';
    const gridId = `${serviceId}-grid-${idModal}`;
    if (s(`.${serviceId}-grid-${idModal}`) && AgGrid.grids[gridId])
      await DefaultManagement.loadTable(idModal, { reload: true });
    else
      htmls(
        `#${id}`,
        await ObjectLayerManagement.RenderTable({
          Elements,
          idModal,
        }),
      );
  },

  loadObjectLayer: async function (objectLayerId, Elements) {
    const id = 'object-layer-engine-viewer';

    try {
      // Load metadata first
      const { status: metaStatus, data: metadata } = await ObjectLayerService.getMetadata({ id: objectLayerId });

      if (metaStatus !== 'success' || !metadata) {
        throw new Error('Failed to load object layer metadata');
      }

      this.Data.objectLayer = metadata;

      // Load frame counts for all directions
      const { status: frameStatus, data: frameData } = await ObjectLayerService.getFrameCounts({ id: objectLayerId });

      if (frameStatus !== 'success' || !frameData) {
        throw new Error('Failed to load frame counts');
      }

      this.Data.frameCounts = frameData.frameCounts;
      // Priority order for directions
      const directions = ['down', 'up', 'left', 'right'];
      // Priority order for modes
      const modes = ['idle', 'walking'];
      this.Data.currentDirection = 'down';
      this.Data.currentMode = 'idle';

      // Render the viewer UI
      await this.renderViewer({ Elements });

      // Generate WebP
      await this.generateWebp();
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
  },

  renderViewer: async function ({ Elements }) {
    const id = 'object-layer-engine-viewer';
    const { objectLayer, frameCounts } = this.Data;

    if (!objectLayer || !frameCounts) return;

    const itemType = objectLayer.data.item.type;
    const itemId = objectLayer.data.item.id;
    const itemDescription = objectLayer.data.item.description || '';
    const itemActivable = objectLayer.data.item.activable || false;

    // Get stats data
    const stats = objectLayer.data.stats || {};

    // Helper function to check if direction/mode has frames
    const hasFrames = (direction, mode) => {
      const numericCode = this.getDirectionCode(direction, mode);
      return numericCode && frameCounts[numericCode] && frameCounts[numericCode] > 0;
    };

    // Helper function to get frame count
    const getFrameCount = (direction, mode) => {
      const numericCode = this.getDirectionCode(direction, mode);
      return numericCode ? frameCounts[numericCode] || 0 : 0;
    };
    ThemeEvents[id] = () => {
      if (!s(`.style-${id}`)) return;
      htmls(
        `.style-${id}`,
        html` <style>
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
            image-rendering: pixelated;
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
              max-height: 440px;
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

          <div class="webp-display-area">
            <div class="webp-canvas-container" id="webp-canvas-container">
              <div style="text-align: center; color: ${darkTheme ? '#aaa' : '#666'};">
                <i class="fa-solid fa-image" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                <p style="margin: 0; font-size: 14px;">WebP preview will appear here</p>
              </div>
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
                  class="control-btn ${this.Data.currentDirection === 'up' ? 'active' : ''}"
                  data-direction="up"
                  ${!hasFrames('up', this.Data.currentMode) ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-arrow-up"></i>
                  <span>Up</span>
                  ${hasFrames('up', this.Data.currentMode)
                    ? html`<span class="frame-count">(${getFrameCount('up', this.Data.currentMode)})</span>`
                    : ''}
                </button>
                <button
                  class="control-btn ${this.Data.currentDirection === 'down' ? 'active' : ''}"
                  data-direction="down"
                  ${!hasFrames('down', this.Data.currentMode) ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-arrow-down"></i>
                  <span>Down</span>
                  ${hasFrames('down', this.Data.currentMode)
                    ? html`<span class="frame-count">(${getFrameCount('down', this.Data.currentMode)})</span>`
                    : ''}
                </button>
                <button
                  class="control-btn ${this.Data.currentDirection === 'left' ? 'active' : ''}"
                  data-direction="left"
                  ${!hasFrames('left', this.Data.currentMode) ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-arrow-left"></i>
                  <span>Left</span>
                  ${hasFrames('left', this.Data.currentMode)
                    ? html`<span class="frame-count">(${getFrameCount('left', this.Data.currentMode)})</span>`
                    : ''}
                </button>
                <button
                  class="control-btn ${this.Data.currentDirection === 'right' ? 'active' : ''}"
                  data-direction="right"
                  ${!hasFrames('right', this.Data.currentMode) ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-arrow-right"></i>
                  <span>Right</span>
                  ${hasFrames('right', this.Data.currentMode)
                    ? html`<span class="frame-count">(${getFrameCount('right', this.Data.currentMode)})</span>`
                    : ''}
                </button>
              </div>
            </div>

            <div class="control-group">
              <h4><i class="fa-solid fa-person-running"></i> Mode</h4>
              <div class="button-group">
                <button
                  class="control-btn ${this.Data.currentMode === 'idle' ? 'active' : ''}"
                  data-mode="idle"
                  ${!hasFrames(this.Data.currentDirection, 'idle') ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-user"></i>
                  <span>Idle</span>
                  ${hasFrames(this.Data.currentDirection, 'idle')
                    ? html`<span class="frame-count">(${getFrameCount(this.Data.currentDirection, 'idle')})</span>`
                    : ''}
                </button>
                <button
                  class="control-btn ${this.Data.currentMode === 'walking' ? 'active' : ''}"
                  data-mode="walking"
                  ${!hasFrames(this.Data.currentDirection, 'walking') ? 'disabled' : ''}
                >
                  <i class="fa-solid fa-person-walking"></i>
                  <span>Walking</span>
                  ${hasFrames(this.Data.currentDirection, 'walking')
                    ? html`<span class="frame-count">(${getFrameCount(this.Data.currentDirection, 'walking')})</span>`
                    : ''}
                </button>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="default-viewer-btn" id="return-to-list-btn">
              <i class="fa-solid fa-arrow-left"></i>
              <span>Return to List</span>
            </button>
            <button class="default-viewer-btn" id="download-webp-btn">
              <i class="fa-solid fa-download"></i>
              <span>Download WebP</span>
            </button>
            <button class="default-viewer-btn edit-btn" id="edit-object-layer-btn">
              <i class="fa-solid fa-edit"></i>
              <span>Edit</span>
            </button>
          </div>
        </div>
      `,
    );
    ThemeEvents[id]();
    // Attach event listeners
    this.attachEventListeners({ Elements });
  },

  attachEventListeners: function ({ Elements }) {
    // Direction buttons
    const directionButtons = document.querySelectorAll('[data-direction]');
    directionButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const direction = e.currentTarget.getAttribute('data-direction');
        if (direction !== this.Data.currentDirection) {
          this.Data.currentDirection = direction;
          await this.renderViewer({ Elements });
          await this.attachEventListeners({ Elements });
          await this.generateWebp();
        }
      });
    });

    // Mode buttons
    const modeButtons = document.querySelectorAll('[data-mode]');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const mode = e.currentTarget.getAttribute('data-mode');
        if (mode !== this.Data.currentMode) {
          this.Data.currentMode = mode;
          await this.renderViewer({ Elements });
          await this.attachEventListeners({ Elements });
          await this.generateWebp();
        }
      });
    });

    // Download button
    const downloadBtn = s('#download-webp-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadWebp();
      });
    }

    // Return to list button
    const listBtn = s('#return-to-list-btn');
    if (listBtn) {
      listBtn.addEventListener('click', () => {
        setPath(`${getProxyPath()}object-layer-engine-viewer`);
        setQueryParams({ cid: null });
        ObjectLayerEngineViewer.renderEmpty({ Elements });
      });
    }

    // Edit button
    const editBtn = s('#edit-object-layer-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        this.toEngine();
      });
    }
  },

  generateWebp: async function () {
    if (this.Data.isGenerating) return;

    const { objectLayer, frameCounts, currentDirection, currentMode } = this.Data;
    if (!objectLayer || !frameCounts) return;

    // Get numeric direction code
    const numericCode = this.getDirectionCode(currentDirection, currentMode);
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
    const frameDuration = objectLayer.data.render.frame_duration || 100;

    this.Data.isGenerating = true;
    this.showLoading(true);

    // Update loading overlay text
    const loadingOverlay = s('#webp-loading-overlay');
    if (loadingOverlay) {
      const loadingText = loadingOverlay.querySelector('span');
      if (loadingText) {
        loadingText.textContent = `Loading WebP animation for ${currentDirection} ${currentMode}...`;
      }
    }

    try {
      // Call the WebP generation API endpoint
      const { status, data } = await ObjectLayerService.generateWebp({
        itemType,
        itemId,
        directionCode: numericCode,
      });

      if (status === 'success' && data) {
        // Store the blob URL
        this.Data.webp = data;

        // Display the WebP in the viewer
        const container = s('#webp-canvas-container');
        if (container) {
          // Clear container
          container.innerHTML = '';

          // Create and append image
          const img = document.createElement('img');
          img.src = data;
          img.alt = 'WebP Animation';
          container.appendChild(img);

          // Create and append info badge
          const infoBadge = document.createElement('div');
          infoBadge.className = 'webp-info-badge';
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
          const displayArea = s('.webp-display-area');
          if (displayArea) {
            displayArea.appendChild(infoBadge);
          }
        }

        // NotificationManager.Push({
        //   html: `WebP generated successfully (${frameCount} frames, ${frameDuration}ms duration)`,
        //   status: 'success',
        // });
      } else {
        throw new Error('Failed to generate WebP');
      }

      this.Data.isGenerating = false;
      this.showLoading(false);
    } catch (error) {
      logger.error('Error generating WebP:', error);
      NotificationManager.Push({
        html: `Failed to generate WebP: ${error.message}`,
        status: 'error',
      });
      this.Data.isGenerating = false;
      this.showLoading(false);
    }
  },

  showLoading: function (show) {
    const overlay = s('#webp-loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
      if (!show) {
        // Reset loading text when hiding
        const loadingText = overlay.querySelector('span');
        if (loadingText) {
          loadingText.textContent = 'Generating WebP...';
        }
      }
    }

    const downloadBtn = s('#download-webp-btn');
    if (downloadBtn) {
      downloadBtn.disabled = show;
    }

    // Remove old info badge if exists
    const oldBadge = s('.webp-info-badge');
    if (oldBadge && show) {
      oldBadge.remove();
    }
  },

  downloadWebp: function () {
    if (!this.Data.webp) {
      NotificationManager.Push({
        html: 'No WebP available to download',
        status: 'warning',
      });
      return;
    }

    const { objectLayer, currentDirection, currentMode } = this.Data;
    const numericCode = this.getDirectionCode(currentDirection, currentMode);
    const filename = `${objectLayer.data.item.id}_${currentDirection}_${currentMode}_${numericCode}.webp`;

    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = this.Data.webp;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    NotificationManager.Push({
      html: `WebP downloaded: ${filename}`,
      status: 'success',
    });
  },

  toEngine: function () {
    const { objectLayer } = this.Data;
    if (!objectLayer || !objectLayer._id) return;

    // Navigate to editor route first
    setPath(`${getProxyPath()}object-layer-engine`);
    // Then add query param without replacing history
    setQueryParams({ cid: objectLayer._id }, { replace: true });

    if (s(`.modal-object-layer-engine`)) {
      ObjectLayerEngineModal.Reload();
    } else {
      s(`.main-btn-object-layer-engine`)?.click();
    }
  },

  Reload: async function ({ Elements }) {
    const queryParams = new URLSearchParams(window.location.search);
    const cid = queryParams.get('cid');

    if (cid) {
      await this.loadObjectLayer(cid, Elements);
    } else {
      this.renderEmpty({ Elements });
    }
  },
};

export { ObjectLayerEngineViewer };
