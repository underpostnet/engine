import { AgGrid } from './AgGrid.js';
import { BtnIcon } from './BtnIcon.js';
import { isValidDate } from './CommonJs.js';
import { darkTheme } from './Css.js';
import { DropDown } from './DropDown.js';
import { loggerFactory } from './Logger.js';
import { RichText } from './RichText.js';
import { ToggleSwitch } from './ToggleSwitch.js';
import { Translate } from './Translate.js';
import { htmls, s } from './VanillaJs.js';
const logger = loggerFactory(import.meta);

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

const getFileFromFileData = (fileData) => {
  const blob = new Blob([new Uint8Array(fileData.data.data)], { type: fileData.mimetype });
  return new File([blob], fileData.name, { type: fileData.mimetype });
};

const getSrcFromFileData = (fileData) => {
  const file = getFileFromFileData(fileData);
  return URL.createObjectURL(file);
};

const Input = {
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

    const inputElement = html` <input
        type="${options?.type ? options.type : 'text'}"
        class="${options.inputClass ? options.inputClass : 'in wfa'} ${id}"
        ${options?.min !== undefined ? `min="${options.min}"` : ''}
        placeholder${options?.placeholder ? `="${options.placeholder}"` : ''}
        ${options?.value !== undefined ? `value="${options.value}"` : ''}
        ${options?.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}
        ${options?.disabled ? `disabled` : ''}
        ${options?.name !== undefined ? `name="${options.name}"` : ''}
        ${options?.pattern !== undefined ? `pattern="${options.pattern}"` : ''}
        ${options?.pattern === undefined && options.type === 'tel' ? `pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"` : ''}
        ${options?.required ? ` required ` : ''}
        ${options?.accept ? `accept="${options.accept}"` : ''}
        ${options?.multiple ? `multiple="multiple"` : ''}
      />
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
                  <i class="fas fa-eye fa-eye-${id} eye-password"></i>
                  <i class="fas fa-eye-slash fa-eye-slash-${id} eye-password" style="display: none"></i>
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
  parseJsonEval: (selector) => {
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
          RichText.Tokens[inputData.id].easyMDE.value('');
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
  setValues: function (formData, obj, originObj, fileObj) {
    setTimeout(() => {
      for (const inputData of formData) {
        if (!s(`.${inputData.id}`)) continue;

        switch (inputData.inputType) {
          case 'file':
            if (fileObj[inputData.model] && s(`.${inputData.id}`)) {
              const dataTransfer = new DataTransfer();

              if (fileObj[inputData.model].fileBlob)
                dataTransfer.items.add(getFileFromFileData(fileObj[inputData.model].fileBlob));

              if (fileObj[inputData.model].mdBlob)
                dataTransfer.items.add(getFileFromFileData(fileObj[inputData.model].mdBlob));

              if (dataTransfer.files.length) {
                s(`.${inputData.id}`).files = dataTransfer.files;
                s(`.${inputData.id}`).onchange({ target: s(`.${inputData.id}`) });
              }
            }

            continue;
            break;
          case 'md':
            RichText.Tokens[inputData.id].easyMDE.value(fileObj[inputData.model].mdPlain);
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
  Render: async function ({ id, multiple }, on = { change: () => {}, clear: () => {} }) {
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
          <input class="wfa ${id}" type="file" ${multiple ? `multiple="multiple"` : ''} />
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

export { Input, InputFile, fileFormDataFactory, getSrcFromFileData, getFileFromFileData };
