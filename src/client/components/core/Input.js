import { AgGrid } from './AgGrid.js';
import { BtnIcon } from './BtnIcon.js';
import { darkTheme } from './Css.js';
import { loggerFactory } from './Logger.js';
import { Translate } from './Translate.js';
import { s } from './VanillaJs.js';
const logger = loggerFactory(import.meta);

const Input = {
  Render: async function (options) {
    const { id } = options;
    options?.placeholder ? (options.placeholder === true ? (options.placeholder = ' . . .') : null) : null;
    setTimeout(() => {
      s(`.input-container-${id}`).onclick = () =>
        ['color'].includes(options.type) ? s(`.${id}`).click() : s(`.${id}`).focus();

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
      class="in wfa ${id}"
      ${options?.min !== undefined ? `min="${options.min}"` : ''}
      placeholder${options?.placeholder ? `="${options.placeholder}"` : ''}
      ${options?.value !== undefined ? `value="${options.value}"` : ''}
      ${options?.autocomplete ? `autocomplete="${options.autocomplete}"` : ''}
      ${options?.disabled ? `disabled` : ''}
    />`;

    return html` <div class="${options?.containerClass ? options.containerClass : ''} input-container-${id}">
      <div class="in">
        <div class="in input-label input-label-${id}">${options?.label ? options.label : ''}</div>
        ${options.type === 'password' && !options.disabledEye
          ? html`
              <div class="fl">
                <div class="in fll" style="width: 80%;">${inputElement}</div>
                <div class="in fll btn-eye-password btn-eye-${id}" style="width: 20%;">
                  <i class="fas fa-eye fa-eye-${id} eye-password"></i>
                  <i class="fas fa-eye-slash fa-eye-slash-${id} eye-password" style="display: none"></i>
                </div>
              </div>
            `
          : inputElement}
        <div class="in input-info input-info-${id}">&nbsp</div>
      </div>
      ${options?.footer ? options.footer : ''}
    </div>`;
  },
  parseJsonEval: (selector) => {
    try {
      return JSON.parse(s(selector).value);
    } catch (error) {
      return s(selector).value;
    }
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
          this.classList.add('sub-container');
        },
        false,
      );

      s(`.drop-zone-${id}`).addEventListener(
        'dragleave',
        function (e) {
          this.classList.remove('sub-container');
        },
        false,
      );
      s(`.drop-zone-${id}`).addEventListener(
        'drop',
        function (e) {
          this.classList.remove('sub-container');
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

export { Input, InputFile };
