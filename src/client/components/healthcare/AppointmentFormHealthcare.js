import { HealthcareAppointmentService } from '../../services/healthcare-appointment/healthcare-appointment.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { NotificationManager } from '../core/NotificationManager.js';
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
    setTimeout(async () => {
      const formData = [
        {
          model: 'appointmentname',
          id: `healthcare-appointment-appointmentname`,
          rules: [{ type: 'isEmpty' }, { type: 'isLength', options: { min: 5, max: 20 } }],
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
    });
    return html`
      <form class="in">
        <div class="in">
          ${await Input.Render({
            id: `healthcare-appointment-appointmentname`,
            type: 'text',
            label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.Render('appointmentname')}`,
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
