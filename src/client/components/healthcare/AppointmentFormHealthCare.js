import { HealthcareAppointmentService } from '../../services/healthcare-appointment/healthcare-appointment.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { Validator } from '../core/Validator.js';
import { s } from '../core/VanillaJs.js';
import { ElementsHealthcare } from './ElementsHealthcare.js';

// https://ewr50l16.forms.app/consulta-nutricional-ayleenbertini

const AppointmentFormHealthcare = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function (options = { bottomRender: async () => '' }, eventData) {
    let mode = 'telemedicine';
    const id0DynamicCol = `dynamicCol-0`;

    setTimeout(async () => {
      const formData = [
        {
          model: 'username',
          id: `healthcare-appointment-patient`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        },
        {
          model: 'phoneNumbers',
          id: `healthcare-appointment-whatsappNumber`,
          rules: [{ type: 'isEmpty' }, { type: 'isMobilePhone' }],
        },
        { model: 'email', id: `healthcare-appointment-email`, rules: [{ type: 'isEmpty' }, { type: 'isEmail' }] },
      ];
      const validators = await Validator.instance(formData);

      EventsUI.onClick(`.btn-healthcare-appointment`, async (e) => {
        e.preventDefault();
        const { errorMessage } = await validators();
        if (errorMessage) return;
        const patient = {};
        for (const inputData of formData) {
          if ('model' in inputData) {
            switch (inputData.model) {
              case 'phoneNumbers':
                {
                  patient[inputData.model] = [
                    {
                      type: 'private',
                      number: s(`.${inputData.id}`).value,
                    },
                  ];
                }
                break;

              default:
                {
                  patient[inputData.model] = s(`.${inputData.id}`).value;
                }
                break;
            }
          }
        }

        const { data, status, message } = await HealthcareAppointmentService.post({
          body: {
            date: eventData.start,
            eventSchedulerId: eventData.event._id,
            patient: Object.keys(patient)
              ? { ...patient, userId: ElementsHealthcare.Data.user.main.model.user._id }
              : {
                  email: 'test@test.com',
                  username: 'Test User',
                  phoneNumbers: [{ type: 'private', number: '1234567890' }],
                  userId: ElementsHealthcare.Data.user.main.model.user._id,
                },
            professional: {
              specialty: ['nutrition'],
            },
          },
        });
        NotificationManager.Push({
          html: status === 'success' ? Translate.Render('appointment-scheduled') : message,
          status,
        });
        await this.Trigger({ data, status, message });
        // Translate.Render(`${result.status}-upload-appointment`),
      });

      s(`.toggle-form-container-healthcare-telemedicine`).onclick = () =>
        ToggleSwitch.Tokens[`healthcare-telemedicine-toggle`].click();
      s(`.toggle-form-container-healthcare-in-person`).onclick = () =>
        ToggleSwitch.Tokens[`healthcare-in-person-toggle`].click();
    });
    return html`
      ${dynamicCol({ containerSelector: id0DynamicCol, id: id0DynamicCol })}
      <div class="fl ${id0DynamicCol}">
        <div class="in fll ${id0DynamicCol}-col-a">
          <form class="in">
            <div class="in">
              ${await Input.Render({
                id: `healthcare-appointment-patient`,
                type: 'text',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('patient')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
              })}
            </div>
            <div class="in">
              ${await Input.Render({
                id: `healthcare-appointment-whatsappNumber`,
                type: 'tel',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('whatsapp-number')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
              })}
            </div>
            <div class="in">
              ${await Input.Render({
                id: `healthcare-appointment-email`,
                type: 'email',
                label: html`<i class="fa-solid fa-envelope"></i> ${Translate.Render('email')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
                autocomplete: 'email',
              })}
            </div>

            <div class="in section-mp toggle-form-container hover">
              <div class="in input-label"><i class="fas fa-caret-right"></i> ${Translate.Render('mode')}</div>

              <div class="fl section-mp toggle-form-container-healthcare-telemedicine">
                <div class="in fll" style="width: 70%">
                  <div class="in">${Translate.Render('telemedicine')}</div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.Render({
                    id: 'healthcare-telemedicine-toggle',
                    containerClass: 'inl',
                    checked: mode === 'telemedicine',
                    disabledOnClick: true,
                    displayMode: 'checkbox',
                    on: {
                      unchecked: () => {},
                      checked: () => {},
                    },
                  })}
                </div>
              </div>

              <div class="fl section-mp toggle-form-container-healthcare-in-person">
                <div class="in fll" style="width: 70%">
                  <div class="in">${Translate.Render('in-person')}</div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.Render({
                    id: 'healthcare-in-person-toggle',
                    containerClass: 'inl',
                    checked: mode === 'in-person',
                    disabledOnClick: true,
                    displayMode: 'checkbox',
                    on: {
                      unchecked: () => {},
                      checked: () => {},
                    },
                  })}
                </div>
              </div>
            </div>

            ${options?.bottomRender ? await options.bottomRender() : ``}
            <div class="in">
              ${await BtnIcon.Render({
                class: 'section-mp form-button btn-healthcare-appointment',
                label: Translate.Render('healthcare-appointment'),
                type: 'submit',
              })}
            </div>
          </form>
        </div>
        <div class="in fll ${id0DynamicCol}-col-b">
          ${eventData ? html`<pre>${JSON.stringify(eventData, null, 4)}</pre>` : ''}
        </div>
      </div>
    `;
  },
};

export { AppointmentFormHealthcare };
