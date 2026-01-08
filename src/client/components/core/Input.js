/**
 * Input component module for form controls and file handling utilities.
 * Provides input rendering, file data conversion, and blob endpoint integration.
 *
 * @module src/client/components/core/Input.js
 * @namespace InputClient
 */

import { AgGrid } from './AgGrid.js';
import { BtnIcon } from './BtnIcon.js';
import { isValidDate } from './CommonJs.js';
import { darkTheme } from './Css.js';
import { DropDown } from './DropDown.js';
import { loggerFactory } from './Logger.js';
import { RichText } from './RichText.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { htmls, htmlStrSanitize, s } from './VanillaJs.js';
import { getApiBaseUrl } from '../../services/core/core.service.js';

/**
 * Logger instance for this module.
 * @type {Function}
 * @memberof InputClient
 * @private
 */
const logger = loggerFactory(import.meta);

/**
 * Creates a FormData object from file input event.
 * Filters files by extension if provided.
 * @function fileFormDataFactory
 * @memberof InputClient
 * @param {Event} e - The input change event containing files.
 * @param {string[]} [extensions] - Optional array of allowed MIME types.
 * @returns {FormData} FormData object containing the valid files.
 */
const fileFormDataFactory = (e, extensions) => {
  const form = new FormData();
  for (const keyFile of Object.keys(e.target.files)) {
    if (extensions && !extensions.includes(e.target.files[keyFile].type)) {
      logger.error('Invalid file extension', e.target.files[keyFile]);
      continue;
    }
    form.append(e.target.files[keyFile].name, e.target.files[keyFile]);
  }
  return form;
};

/**
 * Convert file data to File object.
 * Supports both legacy format (with buffer data) and new format (metadata only).
 *
 * Legacy format: `{ data: { data: [0, 1, 2, ...] }, mimetype: 'text/markdown', name: 'file.md' }`
 * New format: `{ _id: '...', mimetype: 'text/markdown', name: 'file.md' }`
 *
 * @function getFileFromFileData
 * @memberof InputClient
 * @param {Object} fileData - File data object in legacy or new format.
 * @param {Object} [fileData.data] - Legacy format data container.
 * @param {Array<number>} [fileData.data.data] - Legacy format byte array.
 * @param {string} [fileData._id] - New format file ID.
 * @param {string} fileData.mimetype - MIME type of the file.
 * @param {string} fileData.name - Name of the file.
 * @returns {File|null} File object if legacy format, null if metadata-only or invalid.
 */
const getFileFromFileData = (fileData) => {
  if (!fileData) {
    logger.error('getFileFromFileData: fileData is undefined');
    return null;
  }

  // Check if this is legacy format with buffer data
  if (fileData.data?.data) {
    try {
      const blob = new Blob([new Uint8Array(fileData.data.data)], { type: fileData.mimetype });
      return new File([blob], fileData.name, { type: fileData.mimetype });
    } catch (error) {
      logger.error('Error creating File from legacy buffer data:', error);
      return null;
    }
  }

  // New format - metadata only, cannot create File without content
  // Return null and let caller fetch from blob endpoint if needed
  if (fileData._id && !fileData.data?.data) {
    logger.warn(
      'getFileFromFileData: File is metadata-only, cannot create File object without content. File ID:',
      fileData._id,
    );
    return null;
  }

  logger.error('getFileFromFileData: Invalid file data structure', fileData);
  return null;
};

/**
 * Fetch file content from blob endpoint and create File object.
 * Used for metadata-only format files during edit mode.
 *
 * @async
 * @function getFileFromBlobEndpoint
 * @memberof InputClient
 * @param {Object} fileData - File metadata object with _id.
 * @param {string} fileData._id - File ID for blob endpoint lookup.
 * @param {string} [fileData.name] - Optional file name.
 * @param {string} [fileData.mimetype] - Optional MIME type.
 * @returns {Promise<File|null>} File object from blob endpoint, or null on error.
 */
const getFileFromBlobEndpoint = async (fileData) => {
  if (!fileData || !fileData._id) {
    return null;
  }

  try {
    const blobUrl = getApiBaseUrl({ id: fileData._id, endpoint: 'file/blob' });
    const response = await fetch(blobUrl, { credentials: 'include' });
    if (!response.ok) {
      logger.error('Failed to fetch file from blob endpoint:', response.statusText);
      return null;
    }

    const blob = await response.blob();
    return new File([blob], fileData.name || 'file', { type: fileData.mimetype || blob.type });
  } catch (error) {
    logger.error('Error fetching file from blob endpoint:', error);
    return null;
  }
};

/**
 * Get image/file source URL from file data.
 * Supports both legacy format (with buffer) and new format (metadata only).
 * For new format, returns blob endpoint URL.
 *
 * @function getSrcFromFileData
 * @memberof InputClient
 * @param {Object} fileData - File data object in legacy or new format.
 * @param {Object} [fileData.data] - Legacy format data container.
 * @param {Array<number>} [fileData.data.data] - Legacy format byte array.
 * @param {string} [fileData._id] - New format file ID for blob endpoint.
 * @param {string} fileData.mimetype - MIME type of the file.
 * @returns {string|null} Object URL for legacy format, blob endpoint URL for new format, or null on error.
 */
const getSrcFromFileData = (fileData) => {
  if (!fileData) {
    logger.error('getSrcFromFileData: fileData is undefined');
    return null;
  }

  // Legacy format with buffer data - create object URL
  if (fileData.data?.data) {
    try {
      const file = getFileFromFileData(fileData);
      if (file) {
        return URL.createObjectURL(file);
      }
    } catch (error) {
      logger.error('Error getting src from legacy buffer data:', error);
    }
  }

  // New format - use blob endpoint
  if (fileData._id) {
    try {
      return getApiBaseUrl({ id: fileData._id, endpoint: 'file/blob' });
    } catch (error) {
      logger.error('Error generating blob URL:', error);
      return null;
    }
  }

  logger.error('getSrcFromFileData: Cannot generate src, invalid file data:', fileData);
  return null;
};

/**
 * Input component for rendering various form input types.
 * Supports text, password, file, color, date, dropdown, toggle, rich text, and grid inputs.
 * @namespace InputClient.Input
 * @memberof InputClient
 */
const Input = {
  /**
   * Renders an input element based on the provided options.
   * @async
   * @function Render
   * @memberof InputClient.Input
   * @param {Object} options - Input configuration options.
   * @param {string} options.id - Unique identifier for the input.
   * @param {string} [options.type] - Input type (text, password, file, color, datetime-local, etc.).
   * @param {string} [options.placeholder] - Placeholder text.
   * @param {string} [options.label] - Label text for the input.
   * @param {string} [options.containerClass] - CSS class for the container.
   * @param {string} [options.inputClass] - CSS class for the input element.
   * @param {boolean} [options.disabled] - Whether the input is disabled.
   * @returns {Promise<string>} HTML string for the input component.
   */
  Render: async function (options) {
    const { id } = options;
    options?.placeholder
      ? options.placeholder === true
        ? (options.placeholder = ' . . .')
        : options.placeholder
      : null;
    setTimeout(() => {
      if (!s(`.${id}`)) return;
      s(`.input-container-${id}`).onclick = () => {
        ['color', 'file'].includes(options.type) ? s(`.${id}`).click() : s(`.${id}`).focus();
        ['datetime-local'].includes(options.type) ? s(`.${id}`).showPicker() : s(`.${id}`).focus();
      };

      if (s(`.btn-eye-${id}`))
        s(`.btn-eye-${id}`).onclick = () => {
          if (s(`.fa-eye-slash-${id}`).style.display === 'none') {
            s(`.fa-eye-${id}`).style.display = 'none';
            s(`.fa-eye-slash-${id}`).style.display = null;
            s(`.${id}`).type = 'text';
            return;
          }
          s(`.fa-eye-slash-${id}`).style.display = 'none';
          s(`.fa-eye-${id}`).style.display = null;
          s(`.${id}`).type = 'password';
        };
    });

    const labelValue = htmlStrSanitize(options.label) ? htmlStrSanitize(options.label) : id;

    const inputElement = html` <label for="${id}-name">
        <span class="hide">${labelValue}</span>
        <input
          type="${options?.type ? options.type : 'text'}"
          class="${options.inputClass ? options.inputClass : 'in wfa'} ${id}"
          ${options?.min !== undefined ? `min="${options.min}"` : ''}
          ${options?.max !== undefined ? `max="${options.max}"` : ''}
          placeholder${options?.placeholder ? `="${options.placeholder}"` : ''}
          ${options?.value !== undefined ? `value="${options.value}"` : ''}
          ${options?.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}
          ${options?.disabled ? `disabled` : ''}
          ${options?.name !== undefined ? `name="${options.name}"` : `name='${id}-name'`}
          ${options?.pattern !== undefined ? `pattern="${options.pattern}"` : ''}
          ${options?.pattern === undefined && options.type === 'tel' ? `pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"` : ''}
          ${options?.required ? ` required ` : ''}
          ${options?.accept ? `accept="${options.accept}"` : ''}
          ${options?.multiple ? `multiple="multiple"` : ''}
          id="${id}-name"
      /></label>
      <div class="${id}-input-extension input-info input-extension ${options?.extension ? '' : 'hide'}">
        ${options?.extension ? await options.extension() : ''}
      </div>`;

    return html` <div class="${options?.containerClass ? options.containerClass + ' ' : ''} input-container-${id}">
      <div class="in">
        ${options?.label ? html`<div class="in input-label input-label-${id}">${options.label}</div>` : ''}
        ${options.type === 'password' && !options.disabledEye
          ? html`
              <div class="fl input-row-${id}">
                <div class="in fll" style="width: 80%;">${inputElement}</div>
                <div class="in fll btn-eye-password btn-eye-${id}" style="width: 20%;">
                  <div class="abs center">
                    <i class="fas fa-eye fa-eye-${id} eye-password"></i>
                    <i class="fas fa-eye-slash fa-eye-slash-${id} eye-password" style="display: none"></i>
                  </div>
                </div>
              </div>
            `
          : options?.placeholderIcon
            ? html` <div class="fl input-row-${id}">${options.placeholderIcon} ${inputElement}</div> `
            : inputElement}
        <div class="in input-info input-info-${id}">&nbsp</div>
      </div>
    </div>`;
  },
  parseJson: (selector) => {
    try {
      return JSON.parse(s(selector).value);
    } catch (error) {
      return s(selector).value;
    }
  },
  getValues: function (formData) {
    const obj = {};
    for (const inputData of formData) {
      if (inputData.disableRender) continue;
      switch (inputData.inputType) {
        case 'file':
          obj[inputData.model] = s(`.${inputData.id}`).inputFiles;
          continue;
        case 'md':
          obj[inputData.model] = RichText.Tokens[inputData.id].easyMDE.value();
          break;
        case 'checkbox':
        case 'checkbox-on-off':
          obj[inputData.model] = s(`.${inputData.id}-checkbox`).checked;
          continue;

        default:
          break;
      }

      if (!s(`.${inputData.id}`) || !s(`.${inputData.id}`).value || s(`.${inputData.id}`).value === 'undefined')
        continue;
      if ('model' in inputData) {
        obj[inputData.model] = s(`.${inputData.id}`).value;
      }
    }
    return obj;
  },
  cleanValues: function (formData) {
    const obj = {};
    for (const inputData of formData) {
      if (!s(`.${inputData.id}`)) continue;

      switch (inputData.inputType) {
        case 'file':
          s(`.${inputData.id}`).inputFiles = undefined;
          s(`.${inputData.id}`).value = null;

          if (s(`.file-name-render-${inputData.id}`) && s(`.${inputData.id}`).fileNameInputExtDefaultContent)
            htmls(`.file-name-render-${inputData.id}`, `${s(`.${inputData.id}`).fileNameInputExtDefaultContent}`);
          continue;
          break;
        case 'dropdown-checkbox': {
          s(`.dropdown-option-${inputData.id}-reset`).click();
          break;
        }
        case 'md':
          setTimeout(() => {
            RichText.Tokens[inputData.id].easyMDE.value('');
          });
          continue;
          break;
        case 'checkbox':
        case 'checkbox-on-off':
          if (s(`.${inputData.id}-checkbox`).checked) ToggleSwitch.Tokens[inputData.id].click();
          continue;
          break;

        default:
          break;
      }

      if ('model' in inputData) {
        if (!['dropdown'].includes(inputData.inputType)) s(`.${inputData.id}`).value = '';
      }
      if (s(`.input-info-${inputData.id}`)) htmls(`.input-info-${inputData.id}`, html`&nbsp`);
    }
    return obj;
  },
  setValues: async function (formData, obj, originObj, fileObj) {
    setTimeout(async () => {
      for (const inputData of formData) {
        if (!s(`.${inputData.id}`)) continue;

        switch (inputData.inputType) {
          case 'file':
            if (fileObj && fileObj[inputData.model] && s(`.${inputData.id}`)) {
              const dataTransfer = new DataTransfer();

              if (fileObj[inputData.model].fileBlob) {
                let fileBlobData = getFileFromFileData(fileObj[inputData.model].fileBlob);

                // If fileBlob is metadata-only, try to fetch from blob endpoint
                if (!fileBlobData && fileObj[inputData.model].fileBlob?._id) {
                  fileBlobData = await getFileFromBlobEndpoint(fileObj[inputData.model].fileBlob);
                }

                if (fileBlobData) {
                  dataTransfer.items.add(fileBlobData);
                }
              }

              if (fileObj[inputData.model].mdBlob) {
                let mdBlobData = getFileFromFileData(fileObj[inputData.model].mdBlob);

                // If mdBlob is metadata-only, try to fetch from blob endpoint
                if (!mdBlobData && fileObj[inputData.model].mdBlob?._id) {
                  mdBlobData = await getFileFromBlobEndpoint(fileObj[inputData.model].mdBlob);
                }

                if (mdBlobData) {
                  dataTransfer.items.add(mdBlobData);
                }
              }

              if (dataTransfer.files.length) {
                s(`.${inputData.id}`).files = dataTransfer.files;
                s(`.${inputData.id}`).onchange({ target: s(`.${inputData.id}`) });
              }
            }

            continue;
            break;
          case 'md':
            if (fileObj && fileObj[inputData.model] && fileObj[inputData.model].mdPlain) {
              RichText.Tokens[inputData.id].easyMDE.value(fileObj[inputData.model].mdPlain);
            }
            continue;
            break;

          case 'dropdown-checkbox': {
            s(`.dropdown-option-${inputData.id}-reset`).click();
            for (const opt of originObj[inputData.model]) s(`.dropdown-option-${inputData.id}-${opt}`).click();
            break;
          }
          case 'checkbox':
          case 'checkbox-on-off':
            if (
              (obj[inputData.model] === true && !s(`.${inputData.id}-checkbox`).checked) ||
              (!obj[inputData.model] && s(`.${inputData.id}-checkbox`).checked === true)
            )
              ToggleSwitch.Tokens[inputData.id].click();
            continue;
            break;
          case 'datetime-local':
            {
              if (isValidDate(originObj[inputData.model])) {
                const date = new Date(originObj[inputData.model]);
                // date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                s(`.${inputData.id}`).value = date.toISOString().slice(0, 16);
              } else s(`.${inputData.id}`).value = null;
            }
            continue;
            break;
          default:
            break;
        }

        if ('model' in inputData) {
          if (!['dropdown'].includes(inputData.inputType)) s(`.${inputData.id}`).value = obj[inputData.model];
        }
        if (s(`.input-info-${inputData.id}`)) htmls(`.input-info-${inputData.id}`, html`&nbsp`);
      }
    });
  },
};

const InputFile = {
  Render: async function (
    options = { id: '', multiple: false, extensionsAccept: [] },
    on = { change: () => {}, clear: () => {} },
  ) {
    let { id, multiple, extensionsAccept } = options;
    if (!extensionsAccept) extensionsAccept = [];
    // drag drop multi file
    const gridId = `ag-grid-input-file-${id}`;
    setTimeout(() => {
      s(`.btn-clear-input-file-${id}`).onclick = (e) => {
        e.preventDefault();
        s(`.${id}`).value = null;
        AgGrid.grids[gridId].setGridOption('rowData', []);
        if (on && typeof on.clear === 'function') on.clear();
      };

      ['drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'].forEach(function (event) {
        s(`.drop-zone-${id}`).addEventListener(event, function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      });
      s(`.drop-zone-${id}`).addEventListener(
        'dragover',
        function (e) {
          this.classList.add('drop-hover-container');
        },
        false,
      );

      s(`.drop-zone-${id}`).addEventListener(
        'dragleave',
        function (e) {
          this.classList.remove('drop-hover-container');
        },
        false,
      );
      s(`.drop-zone-${id}`).addEventListener(
        'drop',
        function (e) {
          this.classList.remove('drop-hover-container');
          const files = e.dataTransfer.files;
          const dataTransfer = new DataTransfer();

          let countFiles = 0;
          Array.prototype.forEach.call(files, (file) => {
            // logger.info(file);
            if (!multiple && countFiles == 1) return;
            dataTransfer.items.add(file);
            countFiles++;
          });

          s(`.${id}`).files = dataTransfer.files;
          s(`.${id}`).onchange({ target: s(`.${id}`) });
        },
        false,
      );

      s(`.drop-zone-${id}`).addEventListener('click', function (e) {
        s(`.${id}`).click();
      });

      s(`.${id}`).onchange = (e) => {
        // logger.info('e', e);
        const fileGridData = [];
        Object.keys(e.target.files).forEach((fileKey, index) => {
          const file = e.target.files[fileKey];
          logger.info('Load file', file);
          // Get raw:
          // const read = new FileReader();
          // read.readAsBinaryString(file);
          // read.onloadend = () => {
          //   console.log('Load File', e.target.files[fileKey], { fileKey, index }, read.result);
          // };
          fileGridData.push(file);
        });
        AgGrid.grids[gridId].setGridOption('rowData', fileGridData);
        if (on && typeof on.change === 'function') on.change(e);
      };
    });
    return html` <div class="fl">
      <div class="in fll input-file-col">
        <div class="in section-mp input-file-sub-col">
          <input
            class="wfa ${id}"
            type="file"
            ${multiple ? `multiple="multiple"` : ''}
            ${extensionsAccept.length > 0 ? `accept="${extensionsAccept.join(', ')}"` : ''}
          />
          <div class="in">
            ${await BtnIcon.Render({
              class: `wfa btn-clear-input-file-${id}`,
              label: `<i class="fa-solid fa-broom"></i> ${Translate.Render('clear')}`,
            })}
          </div>
          <div class="in">
            ${await AgGrid.Render({
              id: gridId,
              darkTheme,
              style: {
                height: '200px',
              },
              gridOptions: {
                rowData: [],
                columnDefs: [
                  // { field: '_id', headerName: 'ID' },
                  { field: 'name', headerName: 'Name' },
                  { field: 'type', headerName: 'Type' },
                ],
              },
            })}
          </div>
        </div>
      </div>
      <div class="in fll input-file-col">
        <div class="in section-mp input-file-sub-col drop-zone-${id}">
          <div class="abs center">
            <i class="fas fa-cloud" style="font-size: 30px"></i><br />
            ${Translate.Render('drop-file')}
          </div>
        </div>
      </div>
    </div>`;
  },
};

function isTextInputFocused() {
  const active = document.activeElement;
  return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
}

export {
  Input,
  InputFile,
  fileFormDataFactory,
  getSrcFromFileData,
  getFileFromFileData,
  getFileFromBlobEndpoint,
  isTextInputFocused,
};
