import { AgGrid } from '../core/AgGrid.js';
import { darkTheme, dynamicCol } from '../core/Css.js';
import { D3Chart } from '../core/D3Chart.js';
import { newInstance, random, range } from '../core/CommonJs.js';
import Sortable from 'sortablejs';
import { Modal } from '../core/Modal.js';
import { s } from '../core/VanillaJs.js';

const DashboardNexodev = {
  Tokens: {},
  Render: async function (options = { idModal: '' }) {
    const id = options.idModal;
    const { idModal } = options;
    this.Tokens[id] = { ...options };
    const setRandomWeightScore = () => random(0, 100) / 100;

    const rowData = [
      {
        FullName: 'Alice Johnson',
        PhoneNumber: '111-222-3333',
        Email: 'alice.johnson@example.com',
        CurrentAddress: '456 Oak St, Townsville',
        MonthlyIncome: 5500,
        Profession: 'Software Developer',
        Employment: 'Contract',
        PropertyOfInterest: 'Apartment',
        RegistrationDate: '2023-04-01',
        Deadline: '2023-12-15',
        ProgressStatus: 'In Progress',
        Dicom: true,
        PaySlips: true,
        AFPDocument: true,
        HealthInsuranceCert: true,
        Contributions: true,
        WeightedScore: null,
      },
      {
        FullName: 'Carlos Rodriguez',
        PhoneNumber: '333-444-5555',
        Email: 'carlos.rodriguez@example.com',
        CurrentAddress: '789 Pine St, Villagetown',
        MonthlyIncome: 6000,
        Profession: 'Graphic Designer',
        Employment: 'Freelance',
        PropertyOfInterest: 'House',
        RegistrationDate: '2023-05-10',
        Deadline: '2023-11-30',
        ProgressStatus: 'Completed',
        Dicom: false,
        PaySlips: true,
        AFPDocument: true,
        HealthInsuranceCert: false,
        Contributions: true,
        WeightedScore: null,
      },
      {
        FullName: 'Elena Martinez',
        PhoneNumber: '555-666-7777',
        Email: 'elena.martinez@example.com',
        CurrentAddress: '123 Maple St, Cityville',
        MonthlyIncome: 7000,
        Profession: 'Doctor',
        Employment: 'Salaried',
        PropertyOfInterest: 'Condo',
        RegistrationDate: '2023-06-15',
        Deadline: '2023-10-15',
        ProgressStatus: 'On Hold',
        Dicom: true,
        PaySlips: true,
        AFPDocument: false,
        HealthInsuranceCert: true,
        Contributions: false,
        WeightedScore: null,
      },
      {
        FullName: 'George Smith',
        PhoneNumber: '777-888-9999',
        Email: 'george.smith@example.com',
        CurrentAddress: '234 Elm St, Suburbia',
        MonthlyIncome: 5000,
        Profession: 'Teacher',
        Employment: 'Contract',
        PropertyOfInterest: 'Townhouse',
        RegistrationDate: '2023-07-20',
        Deadline: '2023-09-01',
        ProgressStatus: 'In Progress',
        Dicom: false,
        PaySlips: false,
        AFPDocument: true,
        HealthInsuranceCert: true,
        Contributions: true,
        WeightedScore: null,
      },
      {
        FullName: 'Sophie Brown',
        PhoneNumber: '999-000-1111',
        Email: 'sophie.brown@example.com',
        CurrentAddress: '567 Walnut St, Outskirts',
        MonthlyIncome: 6500,
        Profession: 'Accountant',
        Employment: 'Freelance',
        PropertyOfInterest: 'Duplex',
        RegistrationDate: '2023-08-05',
        Deadline: '2023-12-31',
        ProgressStatus: 'In Progress',
        Dicom: true,
        PaySlips: true,
        AFPDocument: true,
        HealthInsuranceCert: true,
        Contributions: true,
        WeightedScore: null,
      },
      {
        FullName: 'Miguel Gonzalez',
        PhoneNumber: '222-333-4444',
        Email: 'miguel.gonzalez@example.com',
        CurrentAddress: '890 Cedar St, Countryside',
        MonthlyIncome: 7500,
        Profession: 'Engineer',
        Employment: 'Salaried',
        PropertyOfInterest: 'Villa',
        RegistrationDate: '2023-09-15',
        Deadline: '2023-11-15',
        ProgressStatus: 'Completed',
        Dicom: false,
        PaySlips: true,
        AFPDocument: true,
        HealthInsuranceCert: false,
        Contributions: true,
        WeightedScore: null,
      },
    ].map((row) => {
      row.WeightedScore = setRandomWeightScore();
      return row;
    });
    setTimeout(() => {
      range(0, 3).map(() => {
        setInterval(() => {
          const rowNode = AgGrid.grids[`ag-grid-${idModal}`].getDisplayedRowAtIndex(random(0, rowData.length - 1));
          if (rowNode) rowNode.setDataValue('WeightedScore', setRandomWeightScore());
        }, random(900, 2000));
      });

      range(0, 3).map(() => {
        setInterval(() => {
          const rowNode = AgGrid.grids[`ag-grid-${idModal}`].getDisplayedRowAtIndex(random(0, rowData.length - 1));
          if (rowNode) rowNode.setDataValue('MonthlyIncome', random(1000, 6000));
        }, random(900, 2000));
      });

      setInterval(() => {
        let tempData = newInstance(rowData);
        range(0, random(0, 2)).map(() => {
          const indexRemove = random(0, tempData.length - 1);
          tempData = tempData.filter((d, i) => i !== indexRemove);
        });
        AgGrid.grids[`ag-grid-${idModal}`].setGridOption('rowData', tempData);
      }, 3000);

      //  gridApi.flashCells({
      //    rowNodes: [rowNode1, rowNode2],
      //    flashDelay: 3000,
      //    fadeDelay: 2000,
      //  });

      this.Tokens[id].sortable = Modal.mobileModal()
        ? null
        : new Sortable(s(`.section-0-${id}`), {
            animation: 150,
            group: `dashboard-sortable`,
            forceFallback: true,
            fallbackOnBody: true,
            store: {
              /**
               * Get the order of elements. Called once during initialization.
               * @param   {Sortable}  sortable
               * @returns {Array}
               */
              get: function (sortable) {
                const order = localStorage.getItem(sortable.options.group.name);
                return order ? order.split('|') : [];
              },

              /**
               * Save the order of elements. Called onEnd (when the item is dropped).
               * @param {Sortable}  sortable
               */
              set: function (sortable) {
                const order = sortable.toArray();
                localStorage.setItem(sortable.options.group.name, order.join('|'));
              },
            },
            // chosenClass: 'css-class',
            // ghostClass: 'css-class',
            // Element dragging ended
            onEnd: function (/**Event*/ evt) {
              // console.log('Sortable onEnd', evt);
              // console.log('evt.oldIndex', evt.oldIndex);
              // console.log('evt.newIndex', evt.newIndex);
              const slotId = Array.from(evt.item.classList).pop();
              // console.log('slotId', slotId);
              if (evt.oldIndex === evt.newIndex) s(`.${slotId}`).click();

              // var itemEl = evt.item; // dragged HTMLElement
              // evt.to; // target list
              // evt.from; // previous list
              // evt.oldIndex; // element's old index within old parent
              // evt.newIndex; // element's new index within new parent
              // evt.oldDraggableIndex; // element's old index within old parent, only counting draggable elements
              // evt.newDraggableIndex; // element's new index within new parent, only counting draggable elements
              // evt.clone; // the clone element
              // evt.pullMode; // when item is in another sortable: `"clone"` if cloning, `true` if moving
            },
          });
    });

    return html`
      ${dynamicCol({ id: `section-0-${id}`, containerSelector: `section-0-${id}`, type: 'a-50-b-50' })}
      <div class="fl section-0-${id}">
        <div class="in fll section-0-${id}-col-a" data-id="0">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-chart-column sub-title-icon"></i> &nbsp Plot</div>
          </div>
          <div class="in section-mp">${await D3Chart.Render()}</div>
        </div>
        <div class="in fll section-0-${id}-col-b" data-id="1">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="far fa-list-alt sub-title-icon"></i> &nbsp Clients</div>
          </div>
          <div class="in section-mp">
            ${await AgGrid.Render({
              id: `ag-grid-${idModal}`,
              enableCellChangeFlash: true,
              darkTheme,
              valueFormatter: (params) => {
                return params.value;
              },
              gridOptions: {
                rowData,
                columnDefs: [
                  { field: 'FullName', headerName: 'FullName' },
                  { field: 'Email', headerName: 'Email' },
                  { field: 'MonthlyIncome', headerName: 'MonthlyIncome' },
                  { field: 'Deadline', headerName: 'Deadline' },
                  { field: 'ProgressStatus', headerName: 'ProgressStatus' },
                  { field: 'WeightedScore', headerName: 'WeightedScore' },
                ],
              },
            })}
          </div>
        </div>
      </div>
    `;
  },
};

export { DashboardNexodev };
