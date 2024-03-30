'use strict';

import { AgGrid } from './components/core/AgGrid.js';
import { BtnIcon } from './components/core/BtnIcon.js';
import { newInstance, random, range } from './components/core/CommonJs.js';
import { Css, dynamicCol } from './components/core/Css.js';
import { DropDown } from './components/core/DropDown.js';
import { Input } from './components/core/Input.js';
import { loggerFactory } from './components/core/Logger.js';
import { Modal } from './components/core/Modal.js';
import { Responsive } from './components/core/Responsive.js';
import { Translate, TranslateCore } from './components/core/Translate.js';
import { s, append } from './components/core/VanillaJs.js';

(async function () {
  const logger = loggerFactory(import.meta);

  await TranslateCore.Init();
  await Responsive.Init();

  const theme = 'bms';
  const { barConfig } = await Css.Init({ theme });
  const idModule = 'bms-rank-dashboard';

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

  // <div class="in"><a href="https://chat.openai.com/c/ab146c74-f10b-43ca-9be7-1f3db31328ca"> BMS </a></div>

  append(
    'body',
    html`
      ${dynamicCol({ containerSelector: `${idModule}-dynamic-col-container`, id: `${idModule}` })}
      <div class="fl ${idModule}-dynamic-col-container">
        <div class="in fll ${idModule}-col-a">
          <div class="in">
            ${await BtnIcon.Render({
              class: `in section-mp btn-custom`,
              label: html`<i class="fa-solid fa-table-columns"></i> Dashboard`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `in section-mp btn-custom`,
              label: html`<i class="fa-solid fa-home"></i> Properties`,
            })}
          </div>
          <div class="in">
            ${await BtnIcon.Render({
              class: `in section-mp btn-custom`,
              label: html`<i class="fa-solid fa-gear"></i> Settings`,
            })}
          </div>
        </div>
        <div class="in fll ${idModule}-col-b">
          <div class="in section-mp">
            <div class="in sub-title-modal"><i class="fa-solid fa-users"></i>Clients</div>
          </div>
          <div class="in section-mp">
            ${await AgGrid.Render({
              id: `ag-grid-${idModule}`,
              enableCellChangeFlash: true,
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
                  // { field: '_id', headerName: 'ID' },
                  // { field: 'biome', headerName: 'Biome' },
                  // { field: 'name', headerName: 'Name' },
                  // { headerName: '', cellRenderer: LoadBiomeRenderer },
                ],
              },
            })}
          </div>
        </div>
      </div>
    `,
  );

  range(0, 3).map(() => {
    setInterval(() => {
      const rowNode = AgGrid.grids[`ag-grid-${idModule}`].getDisplayedRowAtIndex(random(0, rowData.length - 1));
      if (rowNode) rowNode.setDataValue('WeightedScore', setRandomWeightScore());
    }, random(900, 2000));
  });

  range(0, 3).map(() => {
    setInterval(() => {
      const rowNode = AgGrid.grids[`ag-grid-${idModule}`].getDisplayedRowAtIndex(random(0, rowData.length - 1));
      if (rowNode) rowNode.setDataValue('MonthlyIncome', random(1000, 6000));
    }, random(900, 2000));
  });

  setInterval(() => {
    let tempData = newInstance(rowData);
    range(0, random(0, 2)).map(() => {
      const indexRemove = random(0, tempData.length - 1);
      tempData = tempData.filter((d, i) => i !== indexRemove);
    });
    AgGrid.grids[`ag-grid-${idModule}`].setGridOption('rowData', tempData);
  }, 3000);

  //  gridApi.flashCells({
  //    rowNodes: [rowNode1, rowNode2],
  //    flashDelay: 3000,
  //    fadeDelay: 2000,
  //  });

  await Modal.Render({
    id: 'modal-log-in',
    html: async () => html`
      ${await Input.Render({
        id: `input-login-user`,
        label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
        containerClass: 'inl section-mp width-mini-box input-container',
        placeholder: true,
      })}
      ${await Input.Render({
        id: `input-login-pass`,
        label: html`<i class="fa-solid fa-lock"></i> ${Translate.Render('pass')}`,
        type: 'password',
        containerClass: 'inl section-mp width-mini-box input-container',
        placeholder: true,
      })}
      <div class="in">
        ${await BtnIcon.Render({
          class: `inl section-mp btn-custom btn-log-in`,
          label: html`<i class="fa-solid fa-right-to-bracket"></i> ${Translate.Render('log-in')}`,
        })}
        ${await BtnIcon.Render({
          class: 'inl section-mp btn-custom btn-sign-up',
          label: html`<i class="fa-solid fa-user-plus"></i> ${Translate.Render('sign-up')}`,
        })}
      </div>
    `,
    barConfig: newInstance(barConfig),
    title: html`${Translate.Render('log-in')}`,
    style: {
      width: '330px',
      height: '500px',
    },
  });

  s(`.btn-sign-up`).onclick = async () => {
    await Modal.Render({
      id: 'modal-sign-up',
      html: async () => html`
        ${await DropDown.Render({
          label: html`${Translate.Render('select-role')}`,
          type: 'checkbox',
          data: ['broker', 'owner'].map((dKey) => {
            return {
              value: dKey,
              data: dKey,
              checked: true,
              display: html`${Translate.Render(dKey)}`,
              onClick: function () {
                logger.info('DropDown onClick', this.checked);
              },
            };
          }),
        })}
      `,
      barConfig: newInstance(barConfig),
      title: html`${Translate.Render('sign-up')}`,
      style: {
        width: '330px',
        height: '500px',
      },
    });
  };
})();
