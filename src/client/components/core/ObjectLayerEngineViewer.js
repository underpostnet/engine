import { loggerFactory } from './Logger.js';
import { getProxyPath, listenQueryPathInstance } from './Router.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { NotificationManager } from './NotificationManager.js';
import { htmls, s } from './VanillaJs.js';
import { BtnIcon } from './BtnIcon.js';
import { darkTheme, ThemeEvents } from './Css.js';
import { ObjectLayerCyberiaPortal } from '../cyberia-portal/ObjectLayerCyberiaPortal.js';

const logger = loggerFactory(import.meta);

const ObjectLayerEngineViewer = {
  Data: {
    objectLayer: null,
    frameCounts: null,
    currentDirection: 'down',
    currentMode: 'idle',
    gif: null,
    gifWorkerBlob: null,
    isGenerating: false,
    // Binary transparency settings for GIF export
    gifTransparencyPlaceholder: { r: 100, g: 100, b: 100 }, // magenta - unlikely to exist in sprites
    transparencyThreshold: 16, // alpha threshold (0-255) for binary transparency
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

  // Get all possible direction names for a direction code
  getDirectionsFromDirectionCode: function (directionCode) {
    const directionMap = {
      '08': ['down_idle', 'none_idle', 'default_idle'],
      18: ['down_walking'],
      '02': ['up_idle'],
      12: ['up_walking'],
      '04': ['left_idle', 'up_left_idle', 'down_left_idle'],
      14: ['left_walking', 'up_left_walking', 'down_left_walking'],
      '06': ['right_idle', 'up_right_idle', 'down_right_idle'],
      16: ['right_walking', 'up_right_walking', 'down_right_walking'],
    };
    return directionMap[directionCode] || [];
  },

  Render: async function ({ Elements }) {
    const id = 'object-layer-engine-viewer';

    // Listen for cid query parameter
    listenQueryPathInstance(
      {
        id: `${id}-query-listener`,
        routeId: 'object-layer-engine-viewer',
        event: async (cid) => {
          if (cid) {
            await this.loadObjectLayer(cid);
          } else {
            this.renderEmpty();
          }
        },
      },
      'cid',
    );

    setTimeout(async () => {
      htmls(
        `#${id}`,
        html` <div class="inl section-mp">
          <div class="in">
            <div class="fl">
              <div class="in fll">
                ${await BtnIcon.Render({
                  class: 'section-mp main-button',
                  label: html`<i class="fa-solid fa-arrow-left"></i> ${' Back'}`,
                  attrs: `data-id="btn-back"`,
                })}
              </div>
            </div>
          </div>
        </div>`,
      );
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
  },

  renderEmpty: async function () {
    const id = 'object-layer-engine-viewer';
    htmls(`#${id}`, await ObjectLayerCyberiaPortal.Render());
  },

  loadObjectLayer: async function (objectLayerId) {
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

      // Auto-select first available direction/mode combination
      this.selectFirstAvailableDirectionMode();

      // Render the viewer UI
      await this.renderViewer();

      // Initialize gif.js worker
      await this.initGifJs();

      // Generate initial GIF
      await this.generateGif();
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

  renderViewer: async function () {
    const id = 'object-layer-engine-viewer';
    const { objectLayer, frameCounts } = this.Data;

    if (!objectLayer || !frameCounts) return;

    const itemType = objectLayer.data.item.type;
    const itemId = objectLayer.data.item.id;
    const itemDescription = objectLayer.data.item.description || '';
    const itemActivable = objectLayer.data.item.activable || false;
    const frameDuration = objectLayer.data.render.frame_duration || 100;
    const isStateless = objectLayer.data.render.is_stateless || false;

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

          .gif-display-area {
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

          .gif-canvas-container {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
          }

          .gif-canvas-container canvas,
          .gif-canvas-container img {
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

          .gif-canvas-container canvas {
            background: repeating-conic-gradient(#80808020 0% 25%, #fff0 0% 50%) 50% / 20px 20px;
            min-width: 128px;
            min-height: 128px;
          }

          .gif-info-badge {
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

          .gif-info-badge .info-label {
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

          .download-btn {
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

          .download-btn:hover {
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

          .download-btn:disabled {
            background: ${darkTheme ? '#555' : '#ccc'};
            cursor: not-allowed;
            transform: none;
          }

          @media (max-width: 768px) {
            .gif-display-area {
              max-height: 500px;
              min-height: 300px;
              padding: 20px;
            }

            .gif-canvas-container canvas,
            .gif-canvas-container img {
              max-width: 100%;
              max-height: 440px;
            }
          }

          @media (max-width: 600px) {
            .gif-display-area {
              max-height: 400px;
              min-height: 250px;
              padding: 15px;
            }

            .gif-canvas-container canvas,
            .gif-canvas-container img {
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
            color: ${darkTheme ? '#4a9eff' : '#2196F3'};
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

          <div class="gif-display-area">
            <div class="gif-canvas-container" id="gif-canvas-container">
              <div style="text-align: center; color: ${darkTheme ? '#aaa' : '#666'};">
                <i class="fa-solid fa-image" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                <p style="margin: 0; font-size: 14px;">GIF preview will appear here</p>
              </div>
              <div id="gif-loading-overlay" class="loading-overlay" style="display: none;">
                <div>
                  <i class="fa-solid fa-spinner fa-spin"></i>
                  <span style="margin-left: 10px;">Generating GIF...</span>
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
          <!-- Stats Data Section -->
          <div class="control-group" style="margin-bottom: 20px;">
            <h4><i class="fa-solid fa-chart-bar"></i> Stats Data</h4>
            <div
              style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; padding: 10px 0;"
            >
              ${Object.keys(stats).length > 0
                ? Object.entries(stats)
                    .map(
                      ([statKey, statValue]) => html`
                        <div class="item-stat-entry">
                          <span class="item-data-key-label"> ${statKey} </span>
                          <span style="item-data-value-label"> ${statValue} </span>
                        </div>
                      `,
                    )
                    .join('')
                : html`<div class="no-data-container">No stats data available</div>`}
            </div>
          </div>
          <button class="download-btn" id="download-gif-btn">
            <i class="fa-solid fa-download"></i>
            <span>Download GIF</span>
          </button>
        </div>
      `,
    );
    ThemeEvents[id]();
    // Attach event listeners
    this.attachEventListeners();
  },

  attachEventListeners: function () {
    // Direction buttons
    const directionButtons = document.querySelectorAll('[data-direction]');
    directionButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        if (e.currentTarget.disabled) return;
        const direction = e.currentTarget.getAttribute('data-direction');
        if (direction !== this.Data.currentDirection) {
          this.Data.currentDirection = direction;
          await this.renderViewer();
          await this.attachEventListeners();
          await this.generateGif();
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
          await this.renderViewer();
          await this.attachEventListeners();
          await this.generateGif();
        }
      });
    });

    // Download button
    const downloadBtn = s('#download-gif-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        this.downloadGif();
      });
    }

    // Back button
    setTimeout(() => {
      const backBtn = s('[data-id="btn-back"]');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          window.history.back();
        });
      }
    }, 100);
  },

  selectFirstAvailableDirectionMode: function () {
    const { frameCounts } = this.Data;
    if (!frameCounts) return;

    // Priority order for directions
    const directions = ['down', 'up', 'left', 'right'];
    // Priority order for modes
    const modes = ['idle', 'walking'];

    // Try to find first available combination using numeric codes
    for (const mode of modes) {
      for (const direction of directions) {
        const numericCode = this.getDirectionCode(direction, mode);
        if (numericCode && frameCounts[numericCode] && frameCounts[numericCode] > 0) {
          this.Data.currentDirection = direction;
          this.Data.currentMode = mode;
          logger.info(`Auto-selected: ${direction} ${mode} (code: ${numericCode}, ${frameCounts[numericCode]} frames)`);
          return;
        }
      }
    }

    // If no frames found, log warning
    logger.warn('No frames found for any direction/mode combination');
  },

  initGifJs: async function () {
    if (this.Data.gifWorkerBlob) return; // Already initialized

    try {
      // Load gif.js library
      await this.loadScript('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.min.js');

      // Fetch worker script
      const response = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js');
      if (!response.ok) {
        throw new Error('Failed to fetch gif.worker.js');
      }
      const workerBlob = await response.blob();
      this.Data.gifWorkerBlob = URL.createObjectURL(workerBlob);

      logger.info('gif.js initialized successfully');
    } catch (error) {
      logger.error('Error initializing gif.js:', error);
      throw error;
    }
  },

  loadScript: function (src) {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  generateGif: async function () {
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

    try {
      // Build frame paths based on frame count using numeric code
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        frames.push(`${getProxyPath()}assets/${itemType}/${itemId}/${numericCode}/${i}.png`);
      }

      // Update loading message
      const loadingOverlay = s('#gif-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.querySelector('span').textContent = `Loading frames... (0/${frames.length})`;
      }

      // Load all frames to find maximum dimensions
      const loadedImages = [];
      let maxWidth = 0;
      let maxHeight = 0;

      for (let i = 0; i < frames.length; i++) {
        const img = await this.loadImage(frames[i]);
        loadedImages.push(img);
        maxWidth = Math.max(maxWidth, img.naturalWidth);
        maxHeight = Math.max(maxHeight, img.naturalHeight);

        // Update progress
        if (loadingOverlay && (i === 0 || i % 5 === 0)) {
          loadingOverlay.querySelector('span').textContent = `Loading frames... (${i + 1}/${frames.length})`;
        }
      }

      // Update loading message for GIF generation
      if (loadingOverlay) {
        loadingOverlay.querySelector('span').textContent = 'Generating GIF...';
      }

      logger.info(`GIF dimensions calculated: ${maxWidth}x${maxHeight} from ${frames.length} frames`);

      // Use binary transparency with placeholder color (magenta)
      const placeholder = this.Data.gifTransparencyPlaceholder;
      const transparentColorHex = (placeholder.r << 16) | (placeholder.g << 8) | placeholder.b;

      // Create new GIF instance with binary transparency
      const gif = new GIF({
        workers: 2,
        workerScript: this.Data.gifWorkerBlob,
        quality: 10,
        width: maxWidth,
        height: maxHeight,
        transparent: transparentColorHex, // Use magenta as transparent color
        repeat: 0,
      });

      // Process each frame with binary transparency threshold
      for (let i = 0; i < loadedImages.length; i++) {
        const img = loadedImages[i];

        // Create canvas for this frame
        const canvas = document.createElement('canvas');
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });

        // Start with transparent canvas (don't fill with magenta yet)
        ctx.clearRect(0, 0, maxWidth, maxHeight);

        // Center the image
        const x = Math.floor((maxWidth - img.naturalWidth) / 2);
        const y = Math.floor((maxHeight - img.naturalHeight) / 2);

        // Disable smoothing to keep pixel-art sharp
        ctx.imageSmoothingEnabled = false;

        // Draw the original image centered on transparent canvas
        ctx.drawImage(img, x, y);

        // Apply binary transparency threshold: replace ONLY transparent pixels with placeholder color
        const threshold = this.Data.transparencyThreshold;
        try {
          const imageData = ctx.getImageData(0, 0, maxWidth, maxHeight);
          const data = imageData.data;

          for (let p = 0; p < data.length; p += 4) {
            const alpha = data[p + 3];
            // If alpha is below threshold, replace with opaque placeholder color (for GIF transparency)
            if (alpha < threshold) {
              data[p] = placeholder.r; // R
              data[p + 1] = placeholder.g; // G
              data[p + 2] = placeholder.b; // B
              data[p + 3] = 255; // A (fully opaque)
            }
          }

          ctx.putImageData(imageData, 0, 0);
        } catch (err) {
          logger.warn(
            'Could not access image data for transparency threshold (CORS issue). Transparency may not work correctly.',
            err,
          );
        }

        // Add frame to GIF with dispose mode to clear between frames
        gif.addFrame(canvas, {
          delay: frameDuration,
          copy: true,
          dispose: 2, // Restore to background color before drawing next frame (prevents overlap)
        });
      }

      // Handle GIF finished event
      gif.on('finished', (blob) => {
        this.displayGif(blob, maxWidth, maxHeight, frameDuration, frameCount);
        this.Data.gif = blob;
        this.Data.isGenerating = false;
        this.showLoading(false);
      });

      // Render the GIF
      gif.render();
    } catch (error) {
      logger.error('Error generating GIF:', error);
      NotificationManager.Push({
        html: `Failed to generate GIF: ${error.message}`,
        status: 'error',
      });
      this.Data.isGenerating = false;
      this.showLoading(false);
    }
  },

  loadImage: function (src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  },

  displayGif: function (blob, originalWidth, originalHeight, frameDuration, frameCount) {
    const container = s('#gif-canvas-container');
    if (!container) return;

    const url = URL.createObjectURL(blob);

    // Create img element for the animated GIF
    const gifImg = document.createElement('img');
    gifImg.src = url;

    gifImg.onload = () => {
      // Use provided dimensions or get from image
      const naturalWidth = originalWidth || gifImg.naturalWidth;
      const naturalHeight = originalHeight || gifImg.naturalHeight;

      // Calculate intelligent scaling based on container and image size
      const containerEl = s('.gif-display-area');
      const containerWidth = containerEl ? containerEl.clientWidth - 60 : 400; // subtract padding
      const containerHeight = containerEl ? containerEl.clientHeight - 60 : 400;

      // Calculate scale to fit container while maintaining aspect ratio
      const scaleToFitWidth = containerWidth / naturalWidth;
      const scaleToFitHeight = containerHeight / naturalHeight;
      const scaleToFit = Math.min(scaleToFitWidth, scaleToFitHeight);

      // For pixel art, use integer scaling for better visuals
      // Minimum 2x for small sprites, but respect container size
      let scale = Math.max(1, Math.floor(scaleToFit));

      // For very small sprites (< 100px), try to scale up more
      if (Math.max(naturalWidth, naturalHeight) < 100) {
        scale = Math.min(4, Math.floor(scaleToFit));
      }

      // Make sure scaled image fits in container
      const displayWidth = naturalWidth * scale;
      const displayHeight = naturalHeight * scale;

      if (displayWidth > containerWidth || displayHeight > containerHeight) {
        scale = Math.max(1, scale - 1);
      }

      gifImg.style.width = `${naturalWidth * scale}px !important`;
      gifImg.style.height = `${naturalHeight * scale}px !important`;
      gifImg.style.maxWidth = '100%';
      gifImg.style.maxHeight = '540px';

      // Force pixel-perfect rendering (no antialiasing/blur)
      // gifImg.style.imageRendering = 'pixelated';
      // gifImg.style.imageRendering = '-moz-crisp-edges';
      // gifImg.style.imageRendering = 'crisp-edges';
      // gifImg.style.msInterpolationMode = 'nearest-neighbor';

      // Prevent any browser scaling optimizations
      // gifImg.style.transform = 'translateZ(0)'; // Force GPU rendering
      // gifImg.style.backfaceVisibility = 'hidden'; // Prevent subpixel rendering

      // Clear container and add the GIF
      container.innerHTML = '';
      container.appendChild(gifImg);

      // Re-add loading overlay
      const overlay = document.createElement('div');
      overlay.id = 'gif-loading-overlay';
      overlay.className = 'loading-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = html`
        <div>
          <i class="fa-solid fa-spinner fa-spin"></i>
          <span style="margin-left: 10px;">Generating GIF...</span>
        </div>
      `;
      container.appendChild(overlay);

      // Add info badge with dimensions and scale
      const infoBadge = document.createElement('div');
      infoBadge.className = 'gif-info-badge';
      const displayW = Math.round(naturalWidth * scale);
      const displayH = Math.round(naturalHeight * scale);
      infoBadge.innerHTML = html`
        <span class="info-label">Dimensions:</span> ${naturalWidth}x${naturalHeight}px<br />
        <span class="info-label">Display:</span> ${displayW}x${displayH}px<br />
        ${scale > 1 ? `<span class="info-label">Scale:</span> ${scale}x<br />` : ''}
        <span class="info-label">Frames:</span> ${frameCount}<br />
        <span class="info-label">Frame Duration:</span> ${frameDuration}ms<br />
        <span class="info-label">Total Duration:</span> ${(frameDuration * frameCount) / 1000}s
      `;
      s(`.gif-display-area`).appendChild(infoBadge);

      logger.info(`Displaying GIF: ${naturalWidth}x${naturalHeight} at ${scale}x scale (${displayW}x${displayH})`);
    };

    gifImg.onerror = () => {
      logger.error('Failed to load GIF image');
      NotificationManager.Push({
        html: 'Failed to display GIF',
        status: 'error',
      });
    };
  },

  showLoading: function (show) {
    const overlay = s('#gif-loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }

    const downloadBtn = s('#download-gif-btn');
    if (downloadBtn) {
      downloadBtn.disabled = show;
    }
  },

  downloadGif: function () {
    if (!this.Data.gif) {
      NotificationManager.Push({
        html: 'No GIF available to download',
        status: 'warning',
      });
      return;
    }

    const { objectLayer, currentDirection, currentMode } = this.Data;
    const numericCode = this.getDirectionCode(currentDirection, currentMode);
    const filename = `${objectLayer.data.item.id}_${currentDirection}_${currentMode}_${numericCode}.gif`;

    const url = URL.createObjectURL(this.Data.gif);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    NotificationManager.Push({
      html: `GIF downloaded: ${filename}`,
      status: 'success',
    });
  },

  Reload: async function () {
    const queryParams = new URLSearchParams(window.location.search);
    const cid = queryParams.get('cid');

    if (cid) {
      await this.loadObjectLayer(cid);
    } else {
      this.renderEmpty();
    }
  },
};

export { ObjectLayerEngineViewer };
