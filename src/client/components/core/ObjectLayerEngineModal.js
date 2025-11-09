import { CoreService } from '../../services/core/core.service.js';
import { BtnIcon } from './BtnIcon.js';
import { borderChar, dynamicCol } from './Css.js';
import { DropDown } from './DropDown.js';
import { EventsUI } from './EventsUI.js';
import { Translate } from './Translate.js';
import { s, append, hexToRgbA } from './VanillaJs.js';
import { getProxyPath, getQueryParams, setPath, setQueryParams } from './Router.js';
import { s4 } from './CommonJs.js';
import { Input } from './Input.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { ObjectLayerService } from '../../services/object-layer/object-layer.service.js';
import { NotificationManager } from './NotificationManager.js';
import { AgGrid } from './AgGrid.js';
import { Modal } from './Modal.js';
import { loggerFactory } from './Logger.js';
import { LoadingAnimation } from './LoadingAnimation.js';
import { DefaultManagement } from '../../services/default/default.management.js';

const logger = loggerFactory(import.meta, { trace: true });

const ObjectLayerEngineModal = {
  templates: [
    {
      label: 'empty',
      id: 'empty',
      data: [],
    },
  ],
  statDescriptions: {
    effect: {
      title: 'Effect',
      icon: 'fa-solid fa-burst',
      description: 'Amount of life removed when an entity collides or deals an impact.',
      detail: 'Measured in life points.',
    },
    resistance: {
      title: 'Resistance',
      icon: 'fa-solid fa-shield',
      description: "Adds to the owner's maximum life (survivability cap).",
      detail:
        "This value is summed with the entity's base max life. It also increases the amount of life restored when a regeneration event occurs (adds directly to current life).",
    },
    agility: {
      title: 'Agility',
      icon: 'fa-solid fa-person-running',
      description: 'Increases the movement speed of entities.',
      detail: 'Higher values result in faster movement.',
    },
    range: {
      title: 'Range',
      icon: 'fa-solid fa-bullseye',
      description: 'Increases the lifetime of a cast/summoned entity.',
      detail: 'Measured in milliseconds.',
    },
    intelligence: {
      title: 'Intelligence',
      icon: 'fa-solid fa-brain',
      description: 'Probability-based stat that increases the chance to spawn/trigger a summoned entity.',
      detail: 'Higher values increase summoning success rate.',
    },
    utility: {
      title: 'Utility',
      icon: 'fa-solid fa-wrench',
      description: 'Reduces the cooldown time between actions, allowing for more frequent actions.',
      detail: 'It also increases the chance to trigger life-regeneration events.',
    },
  },

  RenderTemplate: (colorTemplate) => {
    const ole = s('object-layer-engine');
    if (!ole) {
      return;
    }

    if (colorTemplate.length === 0) {
      ole.clear();
      return;
    }

    const matrix = colorTemplate.map((row) => row.map((hex) => [...hexToRgbA(hex), 255]));
    ole.loadMatrix(matrix);
  },
  ObjectLayerData: {},
  clearData: function () {
    // Clear all cached object layer data to prevent contamination between sessions
    this.ObjectLayerData = {};

    // Clear the canvas if it exists
    const ole = s('object-layer-engine');
    if (ole && typeof ole.clear === 'function') {
      ole.clear();
    }

    // Clear all frame previews from DOM for all direction codes
    const directionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];
    for (const directionCode of directionCodes) {
      const framesContainer = s(`.frames-${directionCode}`);
      if (framesContainer) {
        framesContainer.innerHTML = '';
      }
    }

    // Clear form inputs with correct IDs
    const itemIdInput = s('#ol-input-item-id');
    if (itemIdInput) itemIdInput.value = '';

    const itemDescInput = s('#ol-input-item-description');
    if (itemDescInput) itemDescInput.value = '';

    const frameDurationInput = s('#ol-input-render-frame-duration');
    if (frameDurationInput) frameDurationInput.value = '100';

    // Reset toggle switches with correct IDs
    const activableCheckbox = s('#ol-toggle-item-activable');
    if (activableCheckbox) activableCheckbox.checked = false;

    const statelessCheckbox = s('#ol-toggle-render-is-stateless');
    if (statelessCheckbox) statelessCheckbox.checked = false;

    // Clear stat inputs with correct IDs
    const statTypes = Object.keys(ObjectLayerEngineModal.statDescriptions);
    for (const stat of statTypes) {
      const statInput = s(`#ol-input-item-stats-${stat}`);
      if (statInput) statInput.value = '0';
    }
  },
  loadFromDatabase: async (objectLayerId) => {
    try {
      // Load metadata first (lightweight)
      const { status: metaStatus, data: metadata } = await ObjectLayerService.getMetadata({ id: objectLayerId });

      if (metaStatus !== 'success' || !metadata) {
        NotificationManager.Push({
          html: `Failed to load object layer metadata`,
          status: 'error',
        });
        return null;
      }

      // Load render data separately (heavy)
      const { status: renderStatus, data: renderData } = await ObjectLayerService.getRender({ id: objectLayerId });

      if (renderStatus !== 'success' || !renderData) {
        NotificationManager.Push({
          html: `Failed to load object layer render data`,
          status: 'error',
        });
        return null;
      }

      return { metadata, renderData };
    } catch (error) {
      console.error('Error loading object layer from database:', error);
      NotificationManager.Push({
        html: `Error loading object layer: ${error.message}`,
        status: 'error',
      });
      return null;
    }
  },
  Render: async (options = { idModal: '', Elements: {} }) => {
    // Clear all cached data at the start of each render to prevent contamination
    ObjectLayerEngineModal.clearData();

    const { Elements } = options;
    await import(`${getProxyPath()}components/core/ObjectLayerEngine.js`);
    // await import(`${getProxyPath()}components/core/WebComponent.js`);
    const directionCodes = ['08', '18', '02', '12', '04', '14', '06', '16'];
    const itemTypes = ['skin', 'weapon', 'armor', 'artifact', 'floor'];
    const statTypes = ['effect', 'resistance', 'agility', 'range', 'intelligence', 'utility'];
    let selectItemType = itemTypes[0];
    let itemActivable = false;
    let renderIsStateless = false;
    let renderFrameDuration = 100;

    // Check if we have a 'cid' query parameter to load existing object layer
    const queryParams = getQueryParams();
    let loadedData = null;
    let existingObjectLayerId = null; // Track the _id for updates
    let originalDirectionCodes = []; // Track original direction codes for update mode
    if (queryParams.cid) {
      existingObjectLayerId = queryParams.cid;
      loadedData = await ObjectLayerEngineModal.loadFromDatabase(queryParams.cid);

      if (loadedData) {
        const { metadata, renderData } = loadedData;

        // Set form values from metadata
        if (metadata.data) {
          if (metadata.data.item) {
            selectItemType = metadata.data.item.type || itemTypes[0];
            itemActivable = metadata.data.item.activable || false;

            // Add loaded item type to itemTypes array if it doesn't exist
            if (selectItemType && !itemTypes.includes(selectItemType)) {
              itemTypes.push(selectItemType);
            }
          }
          if (metadata.data.render) {
            renderIsStateless = metadata.data.render.is_stateless || false;
            renderFrameDuration = metadata.data.render.frame_duration || 100;
          }
        }
      }
    }

    for (const url of [
      `${getProxyPath()}assets/templates/item-skin-08.json`,
      `${getProxyPath()}assets/templates/item-skin-06.json`,
    ]) {
      const id = url.split('/').pop().replace('.json', '');
      ObjectLayerEngineModal.templates.push({
        label: id,
        id,
        data: JSON.parse(await CoreService.getRaw({ url })).color,
      });
    }

    const cells = 26;
    const pixelSize = parseInt(320 / cells);
    const idSectionA = 'template-section-a';
    const idSectionB = 'template-section-b';

    let directionsCodeBarRender = '';

    // Helper function to add a frame to the direction bar
    const addFrameToBar = async (directionCode, id, image, json) => {
      // Capture directionCode in a local variable to ensure proper closure
      const capturedDirectionCode = directionCode;

      append(
        `.frames-${capturedDirectionCode}`,
        html`
          <div class="in fll ${id}">
            <img
              class="in fll direction-code-bar-frames-img direction-code-bar-frames-img-${id}"
              src="${URL.createObjectURL(image)}"
              data-direction-code="${capturedDirectionCode}"
            />
            ${await BtnIcon.Render({
              label: html`<i class="fa-solid fa-trash"></i>`,
              class: `abs direction-code-bar-trash-btn direction-code-bar-trash-btn-${id}`,
            })}
          </div>
        `,
      );

      EventsUI.onClick(`.direction-code-bar-frames-img-${id}`, async (e) => {
        // Get direction code from data attribute to ensure we're using the correct one
        const clickedDirectionCode = e.target.getAttribute('data-direction-code') || capturedDirectionCode;
        console.log(`Clicked frame ${id} from direction code: ${clickedDirectionCode}`);
        const frameData = ObjectLayerEngineModal.ObjectLayerData[clickedDirectionCode]?.find(
          (frame) => frame.id === id,
        );
        if (frameData && frameData.json) {
          console.log(`Loading frame data for direction code ${clickedDirectionCode}:`, frameData.json);
          s('object-layer-engine').importMatrixJSON(frameData.json);
        } else {
          console.error(`Frame data not found for id ${id} in direction code ${clickedDirectionCode}`);
        }
      });

      EventsUI.onClick(`.direction-code-bar-trash-btn-${id}`, async () => {
        s(`.${id}`).remove();
        ObjectLayerEngineModal.ObjectLayerData[capturedDirectionCode] = ObjectLayerEngineModal.ObjectLayerData[
          capturedDirectionCode
        ].filter((frame) => frame.id !== id);
      });
    };

    // Helper function to show loading animation
    const showFrameLoading = () => {
      if (!s(`.frame-editor-container`) || s(`.frame-editor-container`).classList.contains('hide')) return;
      LoadingAnimation.spinner.play(`.frame-editor-container-loading`, 'dual-ring-mini', {
        prepend: html`<span class="inl loading-text">Loading </span><br /><br /> ` + '<div style="color: gray;">',
        append: '</div>',
      });
      s(`.frame-editor-container`).classList.add('hide');
      s(`.frame-editor-container-loading`).classList.remove('hide');
    };

    // Helper function to hide loading animation
    const hideFrameLoading = () => {
      if (!s(`.frame-editor-container-loading`) || s(`.frame-editor-container-loading`).classList.contains('hide'))
        return;
      LoadingAnimation.spinner.stop(`.frame-editor-container-loading`);
      s(`.frame-editor-container-loading`).classList.add('hide');
      s(`.frame-editor-container`).classList.remove('hide');
    };

    // Helper function to process and add frame from PNG URL using ObjectLayerPngLoader
    const processAndAddFrameFromPngUrl = async (directionCode, pngUrl) => {
      // Wait for components to be available with retry logic
      let ole = s('object-layer-engine');
      let loader = s('object-layer-png-loader');

      if (!ole || !loader) {
        console.error('object-layer-engine or object-layer-png-loader component not found after retries');
        return;
      }

      try {
        // Load PNG using the loader component - it will automatically load into the editor
        await loader.loadPngUrl(pngUrl);

        // Export as blob and JSON from component after loading
        const image = await ole.toBlob();
        const json = ole.exportMatrixJSON();
        const id = `frame-loaded-${s4()}-${s4()}`;

        // Add to ObjectLayerData
        if (!ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
          ObjectLayerEngineModal.ObjectLayerData[directionCode] = [];
        }
        ObjectLayerEngineModal.ObjectLayerData[directionCode].push({ id, image, json });
        console.log(
          `Stored frame ${id} in direction code ${directionCode}. Total frames:`,
          ObjectLayerEngineModal.ObjectLayerData[directionCode].length,
        );

        // Add to UI
        await addFrameToBar(directionCode, id, image, json);
      } catch (error) {
        console.error('Error loading frame from PNG URL:', error);
      }
    };

    for (const directionCode of directionCodes) {
      directionsCodeBarRender += html`
        <div class="in section-mp-border">
          <div class="fl">
            <div class="in fll">
              <div class="in direction-code-bar-frames-title">${directionCode}</div>
              <div class="in direction-code-bar-frames-btn">
                ${await BtnIcon.Render({
                  label: html`<i class="fa-solid fa-plus"></i>`,
                  class: `direction-code-bar-frames-btn-${directionCode}`,
                })}
              </div>
            </div>
            <div class="frames-${directionCode}"></div>
          </div>
        </div>
      `;
    }

    let statsInputsRender = '';
    for (const statType of statTypes) {
      const statInfo = ObjectLayerEngineModal.statDescriptions[statType];
      const statValue = loadedData?.metadata?.data?.stats?.[statType] || 0;
      statsInputsRender += html`
        <div class="inl" style="margin-bottom: 10px; position: relative;">
          ${await Input.Render({
            id: `ol-input-item-stats-${statType}`,
            label: html`<div
              title="${statInfo.description} ${statInfo.detail}"
              class="inl stat-label-container stat-info-icon"
              style="width: 120px; font-size: 16px; overflow: visible; position: relative;"
            >
              <i class="${statInfo.icon}" style="margin-right: 5px;"></i> ${statInfo.title}
            </div>`,
            containerClass: 'inl',
            type: 'number',
            min: 0,
            max: 10,
            placeholder: true,
            value: statValue,
          })}
          <div class="in stat-description">
            ${statInfo.description}<br />
            <span style="color: #888; font-style: italic;">${statInfo.detail}</span>
          </div>
        </div>
      `;
    }

    setTimeout(async () => {
      showFrameLoading();
      for (const directionCode of directionCodes) {
        // Use IIFE to properly capture directionCode and handle async operations
        await (async (currentDirectionCode) => {
          // Register frame add button handler after DOM is ready
          // Wait longer to ensure all direction bars are rendered

          if (loadedData && loadedData.metadata && loadedData.metadata.data && currentDirectionCode) {
            // Show loading animation only once on first direction that has frames

            const { type, id } = loadedData.metadata.data.item;
            const directions = ObjectLayerEngineModal.getDirectionsFromDirectionCode(currentDirectionCode);

            console.log(`Loading frames for direction code: ${currentDirectionCode}, directions:`, directions);

            // Check if frames exist for any direction mapped to this direction code
            const { frames } = loadedData.renderData.data.render;
            for (const direction of directions) {
              if (frames[direction] && frames[direction].length > 0) {
                // Track this direction code as having original data
                if (!originalDirectionCodes.includes(currentDirectionCode)) {
                  originalDirectionCodes.push(currentDirectionCode);
                }
                // Load frames from static PNG URLs sequentially to avoid race conditions
                const frameCount = frames[direction].length;
                console.log(`Found ${frameCount} frames for direction: ${direction} (code: ${currentDirectionCode})`);
                for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
                  const pngUrl = `${getProxyPath()}assets/${type}/${id}/${currentDirectionCode}/${frameIndex}.png`;
                  console.log(`Loading frame ${frameIndex} for direction code ${currentDirectionCode} from: ${pngUrl}`);
                  await processAndAddFrameFromPngUrl(currentDirectionCode, pngUrl);
                }
                console.log(`Completed loading ${frameCount} frames for direction code: ${currentDirectionCode}`);
                // Once we found frames for this direction code, we can break to avoid duplicates
                break;
              }
            }
          }

          const buttonSelector = `.direction-code-bar-frames-btn-${currentDirectionCode}`;
          console.log(`Registering click handler for: ${buttonSelector}`);

          EventsUI.onClick(buttonSelector, async () => {
            console.log(`Add frame button clicked for direction: ${currentDirectionCode}`);
            const ole = s('object-layer-engine');
            if (!ole) {
              console.error('object-layer-engine not found');
              return;
            }
            const image = await ole.toBlob();
            const json = ole.exportMatrixJSON();
            const id = `frame-capture-${s4()}-${s4()}`;
            console.log(`Creating new frame ${id} for direction ${currentDirectionCode}`);

            if (!ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode])
              ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode] = [];
            ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode].push({ id, image, json });
            console.log(
              `Stored frame ${id} in direction code ${currentDirectionCode}. Total frames:`,
              ObjectLayerEngineModal.ObjectLayerData[currentDirectionCode].length,
            );

            await addFrameToBar(currentDirectionCode, id, image, json);
          });
        })(directionCode);
      }
      hideFrameLoading();
      s('object-layer-engine').clear();

      EventsUI.onClick(`.ol-btn-save`, async () => {
        // Validate minimum frame_duration 100ms
        const frameDuration = parseInt(s(`.ol-input-render-frame-duration`).value);
        if (!frameDuration || frameDuration < 100) {
          NotificationManager.Push({
            html: 'Frame duration must be at least 100ms',
            status: 'error',
          });
          return;
        }

        // Validate that item.id is not empty
        const itemId = s(`.ol-input-item-id`).value;
        if (!itemId || itemId.trim() === '') {
          NotificationManager.Push({
            html: 'Item ID is required',
            status: 'error',
          });
          return;
        }

        const objectLayer = {
          data: {
            render: {
              frames: {},
              color: [],
              frame_duration: 0,
              is_stateless: false,
            },
            stats: {},
            item: {},
          },
        };
        for (const directionCode of directionCodes) {
          const directions = ObjectLayerEngineModal.getDirectionsFromDirectionCode(directionCode);
          for (const direction of directions) {
            if (!objectLayer.data.render.frames[direction]) objectLayer.data.render.frames[direction] = [];

            if (!(directionCode in ObjectLayerEngineModal.ObjectLayerData)) {
              console.warn('No set directionCodeBarFrameData for directionCode', directionCode);
              continue;
            }

            for (const frameData of ObjectLayerEngineModal.ObjectLayerData[directionCode]) {
              const { matrix } = JSON.parse(frameData.json);
              const frameIndexColorMatrix = [];
              let indexRow = -1;
              for (const row of matrix) {
                indexRow++;
                frameIndexColorMatrix[indexRow] = [];
                let indexCol = -1;
                for (const value of row) {
                  indexCol++;
                  let colorIndex = objectLayer.data.render.color.findIndex(
                    (color) =>
                      color[0] === value[0] && color[1] === value[1] && color[2] === value[2] && color[3] === value[3],
                  );
                  if (colorIndex === -1) {
                    objectLayer.data.render.color.push(value);
                    colorIndex = objectLayer.data.render.color.length - 1;
                  }
                  frameIndexColorMatrix[indexRow][indexCol] = colorIndex;
                }
              }
              objectLayer.data.render.frames[direction].push(frameIndexColorMatrix);
            }
          }
        }
        objectLayer.data.render.frame_duration = parseInt(s(`.ol-input-render-frame-duration`).value);
        objectLayer.data.render.is_stateless = renderIsStateless;
        objectLayer.data.stats = {
          effect: parseInt(s(`.ol-input-item-stats-effect`).value),
          resistance: parseInt(s(`.ol-input-item-stats-resistance`).value),
          agility: parseInt(s(`.ol-input-item-stats-agility`).value),
          range: parseInt(s(`.ol-input-item-stats-range`).value),
          intelligence: parseInt(s(`.ol-input-item-stats-intelligence`).value),
          utility: parseInt(s(`.ol-input-item-stats-utility`).value),
        };
        objectLayer.data.item = {
          type: selectItemType,
          activable: itemActivable,
          id: s(`.ol-input-item-id`).value,
          description: s(`.ol-input-item-description`).value,
        };

        // Add _id if we're updating an existing object layer
        if (existingObjectLayerId) {
          objectLayer._id = existingObjectLayerId;
        }

        console.warn('objectLayer', objectLayer, existingObjectLayerId ? '(UPDATE MODE)' : '(CREATE MODE)');

        if (Elements.Data.user.main.model.user.role === 'guest') {
          NotificationManager.Push({
            html: 'Guests cannot save object layers. Please log in.',
            status: 'warning',
          });
          return;
        }

        // Upload images
        {
          // Get all direction codes that currently have frames
          const directionCodesToUpload = Object.keys(ObjectLayerEngineModal.ObjectLayerData);

          // In UPDATE mode, also include original direction codes that may have been cleared
          const allDirectionCodes = existingObjectLayerId
            ? [...new Set([...directionCodesToUpload, ...originalDirectionCodes])]
            : directionCodesToUpload;

          console.warn(
            `Uploading frames for ${allDirectionCodes.length} directions:`,
            allDirectionCodes,
            existingObjectLayerId ? '(UPDATE MODE)' : '(CREATE MODE)',
          );

          for (const directionCode of allDirectionCodes) {
            const frames = ObjectLayerEngineModal.ObjectLayerData[directionCode] || [];
            console.warn(`Direction ${directionCode}: ${frames.length} frames`);

            // Create FormData with ALL frames for this direction
            const form = new FormData();
            let frameIndex = -1;
            for (const frame of frames) {
              frameIndex++;
              const pngBlob = frame.image;

              if (!pngBlob) {
                console.error(`Frame ${frameIndex} in direction ${directionCode} has no image blob!`);
                continue;
              }

              // Append all frames to the same FormData
              form.append(directionCode, pngBlob, `${frameIndex}.png`);
            }

            // Send all frames for this direction in one request (even if empty, to remove frames)
            try {
              if (existingObjectLayerId) {
                // UPDATE: use PUT endpoint with object layer ID
                const { status, data } = await ObjectLayerService.put({
                  id: `${existingObjectLayerId}/frame-image/${objectLayer.data.item.type}/${objectLayer.data.item.id}/${directionCode}`,
                  body: form,
                  headerId: 'file',
                });
                console.warn(`Updated ${frames.length} frames for direction ${directionCode}`);
              } else {
                // CREATE: use POST endpoint (only if frames exist)
                if (frames.length > 0) {
                  const { status, data } = await ObjectLayerService.post({
                    id: `frame-image/${objectLayer.data.item.type}/${objectLayer.data.item.id}/${directionCode}`,
                    body: form,
                    headerId: 'file',
                  });
                  console.warn(`Created ${frames.length} frames for direction ${directionCode}`);
                }
              }
            } catch (error) {
              console.error(`Error uploading frames for direction ${directionCode}:`, error);
              NotificationManager.Push({
                html: `Error uploading frames for direction ${directionCode}: ${error.message}`,
                status: 'error',
              });
              return;
            }
          }

          console.warn('All frames uploaded successfully');
        }

        // Upload metadata
        {
          delete objectLayer.data.render.frames;
          delete objectLayer.data.render.color;

          let response;
          if (existingObjectLayerId) {
            // UPDATE existing object layer
            console.warn(
              'PUT path:',
              `${existingObjectLayerId}/metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
            );
            response = await ObjectLayerService.put({
              id: `${existingObjectLayerId}/metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
              body: objectLayer,
            });
          } else {
            // CREATE new object layer
            response = await ObjectLayerService.post({
              id: `metadata/${objectLayer.data.item.type}/${objectLayer.data.item.id}`,
              body: objectLayer,
            });
          }

          const { status, data, message } = response;

          if (status === 'success') {
            NotificationManager.Push({
              html: `Object layer "${objectLayer.data.item.id}" ${existingObjectLayerId ? 'updated' : 'created'} successfully!`,
              status: 'success',
            });
            ObjectLayerEngineModal.toManagement();
          } else {
            NotificationManager.Push({
              html: `Error ${existingObjectLayerId ? 'updating' : 'creating'} object layer: ${message}`,
              status: 'error',
            });
          }
        }
      });

      // Add reset button event listener
      EventsUI.onClick(`.ol-btn-reset`, async () => {
        const confirmResult = await Modal.RenderConfirm({
          html: async () => {
            return html`
              <div class="in section-mp" style="text-align: center">
                Are you sure you want to reset the form? All unsaved data will be lost.
              </div>
            `;
          },
          id: `reset-ol-modal-confirm`,
        });

        if (confirmResult.status === 'confirm') {
          NotificationManager.Push({
            html: 'Resetting form to create new object layer...',
            status: 'info',
          });

          // Clear all data
          ObjectLayerEngineModal.clearData();

          setPath(`${getProxyPath()}object-layer-engine`);

          // Reload the modal
          await ObjectLayerEngineModal.Reload();

          NotificationManager.Push({
            html: 'Form reset! Ready to create new object layer.',
            status: 'success',
          });
        }
      });
    });

    return html`
      <style>
        .direction-code-bar-frames-title {
          font-weight: bold;
          font-size: 1.2rem;
          padding: 0.5rem;
        }
        .direction-code-bar-frames-img {
          width: 100px;
          height: auto;
          margin: 3px;
          cursor: pointer;
        }
        .direction-code-bar-trash-btn {
          top: 3px;
          left: 3px;
          background: red;
          color: white;
        }
        .ol-btn-save {
          width: 120px;
          padding: 0.5rem;
          font-size: 20px;
          min-height: 50px;
        }
        .ol-btn-reset {
          width: 120px;
          padding: 0.5rem;
          font-size: 20px;
          min-height: 50px;
        }
        .ol-number-label {
          width: 120px;
          font-size: 16px;
          overflow: hidden;
          font-family: 'retro-font';
        }
        .sub-title-modal {
          color: #ffcc00;
        }
        .stat-label-container {
          display: flex;
          align-items: center;
        }
        .stat-info-icon {
          cursor: default;
        }
        .stat-description {
          padding: 2px 5px;
          border-left: 2px solid #444;
          margin-bottom: 5px;
          max-width: 200px;
        }
        .frame-editor-container-loading {
          width: 100%;
          height: 150px;
          color: #ffcc00;
        }
        .loading-text {
          font-family: 'retro-font';
          font-size: 26px;
        }
      </style>
      ${borderChar(2, 'black', ['.sub-title-modal', '.frame-editor-container-loading'])}
      <div class="in frame-editor-container-loading">
        <div class="abs center frame-editor-container-loading-center"></div>
      </div>
      <div class="in section-mp section-mp-border frame-editor-container">
        <div class="in sub-title-modal"><i class="fa-solid fa-table-cells-large"></i> Frame editor</div>

        <object-layer-engine id="ole" width="${cells}" height="${cells}" pixel-size="${pixelSize}">
        </object-layer-engine>
        <object-layer-png-loader id="loader" editor-selector="#ole"></object-layer-png-loader>
      </div>

      <div class="in section-mp section-mp-border">
        <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Render data</div>
        ${dynamicCol({ containerSelector: options.idModal, id: idSectionA })}

        <div class="fl">
          <div class="in fll ${idSectionA}-col-a">
            <div class="in section-mp">
              ${await DropDown.Render({
                value: ObjectLayerEngineModal.templates[0].id,
                label: html`${Translate.Render('select-template')}`,
                data: ObjectLayerEngineModal.templates.map((template) => {
                  return {
                    value: template.id,
                    display: html`<i class="fa-solid fa-paint-roller"></i> ${template.label}`,
                    onClick: async () => {
                      ObjectLayerEngineModal.RenderTemplate(template.data);
                    },
                  };
                }),
              })}
            </div>
          </div>
          <div class="in fll ${idSectionA}-col-b">
            <div class="in section-mp-border" style="width: 135px;">
              ${await Input.Render({
                id: `ol-input-render-frame-duration`,
                label: html`<div class="inl ol-number-label">
                  <i class="fa-solid fa-chart-simple"></i> Frame duration
                </div>`,
                containerClass: 'inl',
                type: 'number',
                min: 100,
                max: 1000,
                placeholder: true,
                value: renderFrameDuration,
              })}
            </div>
            <div class="in section-mp">
              ${await ToggleSwitch.Render({
                id: 'ol-toggle-render-is-stateless',
                wrapper: true,
                wrapperLabel: html`${Translate.Render('is-stateless')}`,
                disabledOnClick: true,
                checked: renderIsStateless,
                on: {
                  unchecked: () => {
                    renderIsStateless = false;
                    console.warn('renderIsStateless', renderIsStateless);
                  },
                  checked: () => {
                    renderIsStateless = true;
                    console.warn('renderIsStateless', renderIsStateless);
                  },
                },
              })}
            </div>
          </div>
        </div>
        ${directionsCodeBarRender}
      </div>
      ${dynamicCol({ containerSelector: options.idModal, id: idSectionB, type: 'a-50-b-50' })}

      <div class="fl">
        <div class="in fll ${idSectionB}-col-a">
          <div class="in section-mp section-mp-border">
            <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Item data</div>
            ${await Input.Render({
              id: `ol-input-item-id`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-id')}`,
              containerClass: '',
              placeholder: true,
              value: loadedData?.metadata?.data?.item?.id || '',
            })}
            ${await Input.Render({
              id: `ol-input-item-description`,
              label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('item-description')}`,
              containerClass: '',
              placeholder: true,
              value: loadedData?.metadata?.data?.item?.description || '',
            })}
            <div class="in section-mp">
              ${await DropDown.Render({
                value: selectItemType,
                label: html`${Translate.Render('select-item-type')}`,
                data: itemTypes.map((itemType) => {
                  return {
                    value: itemType,
                    display: html`${itemType}`,
                    onClick: async () => {
                      console.warn('itemType click', itemType);
                      selectItemType = itemType;
                    },
                  };
                }),
              })}
            </div>
            <div class="in section-mp">
              ${await ToggleSwitch.Render({
                id: 'ol-toggle-item-activable',
                wrapper: true,
                wrapperLabel: html`${Translate.Render('item-activable')}`,
                disabledOnClick: true,
                checked: itemActivable,
                on: {
                  unchecked: () => {
                    itemActivable = false;
                    console.warn('itemActivable', itemActivable);
                  },
                  checked: () => {
                    itemActivable = true;
                    console.warn('itemActivable', itemActivable);
                  },
                },
              })}
            </div>
          </div>
        </div>
        <div class="in fll ${idSectionB}-col-b">
          <div class="in section-mp section-mp-border">
            <div class="in sub-title-modal"><i class="fa-solid fa-database"></i> Stats data</div>
            ${statsInputsRender}
          </div>
        </div>
      </div>

      <div class="fl section-mp">
        ${await BtnIcon.Render({
          label: html`<i class="submit-btn-icon fa-solid fa-folder-open"></i> ${Translate.Render('save')}`,
          class: `in flr ol-btn-save`,
        })}
        ${await BtnIcon.Render({
          label: html`<i class="submit-btn-icon fa-solid fa-broom"></i> ${Translate.Render('reset')}`,
          class: `in flr ol-btn-reset`,
        })}
      </div>
      <div class="in section-mp"></div>
    `;
  },
  getDirectionsFromDirectionCode(directionCode = '08') {
    let objectLayerFrameDirections = [];

    switch (directionCode) {
      case '08':
        objectLayerFrameDirections = ['down_idle', 'none_idle', 'default_idle'];
        break;
      case '18':
        objectLayerFrameDirections = ['down_walking'];
        break;
      case '02':
        objectLayerFrameDirections = ['up_idle'];
        break;
      case '12':
        objectLayerFrameDirections = ['up_walking'];
        break;
      case '04':
        objectLayerFrameDirections = ['left_idle', 'up_left_idle', 'down_left_idle'];
        break;
      case '14':
        objectLayerFrameDirections = ['left_walking', 'up_left_walking', 'down_left_walking'];
        break;
      case '06':
        objectLayerFrameDirections = ['right_idle', 'up_right_idle', 'down_right_idle'];
        break;
      case '16':
        objectLayerFrameDirections = ['right_walking', 'up_right_walking', 'down_right_walking'];
        break;
    }

    return objectLayerFrameDirections;
  },
  toManagement: async () => {
    await ObjectLayerEngineModal.clearData();
    const queryParams = getQueryParams();
    queryParams.page = 1;
    setQueryParams(queryParams);
    const managerComponent = DefaultManagement.Tokens['modal-object-layer-engine-management'];
    if (managerComponent) {
      managerComponent.page = 1;
      if (!managerComponent.readyRowDataEvent) managerComponent.readyRowDataEvent = {};
      let readyLoad = false;
      const gridId = 'object-layer-engine-management-grid-modal-object-layer-engine-management';
      managerComponent.readyRowDataEvent['object-layer-engine-management'] = async () => {
        if (readyLoad) {
          AgGrid.grids[gridId].setGridOption('getRowClass', null);
          return delete managerComponent.readyRowDataEvent['object-layer-engine-management'];
        }

        AgGrid.grids[gridId].setGridOption('getRowClass', (params) => {
          if (params.node.rowIndex === 0) {
            return 'row-new-highlight';
          }
        });
        readyLoad = true;
      };
    }

    const _s = s(`.management-table-btn-reload-modal-object-layer-engine-management`);
    if (_s) _s.click();

    s(`.main-btn-object-layer-engine-management`).click();
  },
  Reload: async function () {
    // Clear data before reload to prevent contamination
    ObjectLayerEngineModal.clearData();
    const idModal = 'modal-object-layer-engine';
    if (s(`.modal-object-layer-engine`))
      Modal.writeHTML({
        idModal,
        html: await Modal.Data[idModal].options.html(),
      });
  },
};

export { ObjectLayerEngineModal };
