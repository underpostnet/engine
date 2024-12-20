import { HealthcareAppointmentService } from '../../services/healthcare-appointment/healthcare-appointment.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { Validator } from '../core/Validator.js';
import { s } from '../core/VanillaJs.js';

// https://ewr50l16.forms.app/consulta-nutricional-ayleenbertini

const AppointmentFormHealthcare = {
  Event: {},
  Trigger: async function (options) {
    for (const eventKey of Object.keys(this.Event)) await this.Event[eventKey](options);
  },
  Render: async function (options = { bottomRender: async () => '' }) {
    let mode = 'telemedicine';
    setTimeout(async () => {
      const formData = [
        {
          model: 'patient',
          id: `healthcare-appointment-patient`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 2, max: 20 } }],
        },
        {
          model: 'whatsappNumber',
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
        const body = {};
        for (const inputData of formData) {
          if ('model' in inputData) body[inputData.model] = s(`.${inputData.id}`).value;
        }
        const result = await HealthcareAppointmentService.post({ body });
        NotificationManager.Push({
          html: typeof result.data === 'string' ? result.data : Translate.Render(`${result.status}-upload-appointment`),
          status: result.status,
        });
        if (result.status === 'success') {
          await this.Trigger(result.data);
        }
      });

      s(`.toggle-form-container-healthcare-telemedicine`).onclick = () =>
        ToggleSwitch.Tokens[`healthcare-telemedicine-toggle`].click();
      s(`.toggle-form-container-healthcare-in-person`).onclick = () =>
        ToggleSwitch.Tokens[`healthcare-in-person-toggle`].click();
    });
    return html`
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
    `;
  },
};

export { AppointmentFormHealthcare };
