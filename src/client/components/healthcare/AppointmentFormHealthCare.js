import { HealthcareAppointmentService } from '../../services/healthcare-appointment/healthcare-appointment.service.js';
import { BtnIcon } from '../core/BtnIcon.js';
import { dynamicCol } from '../core/Css.js';
import { EventsUI } from '../core/EventsUI.js';
import { Input } from '../core/Input.js';
import { Modal } from '../core/Modal.js';
import { NotificationManager } from '../core/NotificationManager.js';
import { ToggleSwitch } from '../core/ToggleSwitch.js';
import { Translate } from '../core/Translate.js';
import { Validator } from '../core/Validator.js';
import { s } from '../core/VanillaJs.js';
import { AppointmentEventType, appointmentEvents } from '../core/ClientEvents.js';
import { AppStoreHealthcare } from './AppStoreHealthcare.js';
// https://ewr50l16.forms.app/consulta-nutricional-ayleenbertini
class AppointmentFormHealthcare {
  static Event = {};
  static onSubmitted(listener, options = {}) {
    if (options.key) AppointmentFormHealthcare.Event[options.key] = listener;
    return appointmentEvents.on(AppointmentEventType.submitted, listener, options);
  }
  static offSubmitted(key) {
    delete AppointmentFormHealthcare.Event[key];
    return appointmentEvents.off(key);
  }
  static hasSubmittedListener(key) {
    return appointmentEvents.has(key);
  }
  static async Trigger(options) {
    await appointmentEvents.emit(AppointmentEventType.submitted, options);
    for (const eventKey of Object.keys(AppointmentFormHealthcare.Event))
      await AppointmentFormHealthcare.Event[eventKey](options);
  }
  static async instance(options = { bottomRender: async () => '' }, eventData) {
    let mode = 'healthcare-company-public';
    const id0DynamicCol = `dynamicCol-0`;
    setTimeout(async () => {
      const formData = [
        {
          model: 'identityDocument',
          id: `healthcare-appointment-identityDocument`,
          rules: [{ type: 'isEmpty' }, { type: 'isChileanIdentityDocument' }],
        },
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
              ? {
                  ...patient,
                  companyType: mode === 'healthcare-company-private' ? 'private' : 'public',
                  userId: AppStoreHealthcare.Data.user.main.model.user._id,
                }
              : {
                  email: 'test@test.com',
                  username: 'Test User',
                  phoneNumbers: [{ type: 'private', number: '1234567890' }],
                  userId: AppStoreHealthcare.Data.user.main.model.user._id,
                },
            professional: {
              specialty: ['nutrition'],
            },
          },
        });
        NotificationManager.Push({
          html: status === 'success' ? Translate.instance('appointment-scheduled') : message,
          status,
        });
        if (status === 'success') {
          await AppointmentFormHealthcare.Trigger({ data, status, message });
          const confirmResult = await Modal.RenderConfirm({
            icon: html`<i class="fas fa-check" style="color: green"></i>`,
            disableBtnCancel: true,
            html: async () => {
              return html`
                <div class="in section-mp" style="text-align: center; font-size: 20px">
                  ${Translate.instance('success-healthcare-appointment')}
                </div>
              `;
            },
            id: 'success-healthcare-appointment',
          });
          if (confirmResult.status === 'cancelled') return;
        }
        // Translate.instance(`${result.status}-upload-appointment`),
      });
      s(`.toggle-form-container-healthcare-healthcare-company-private`).onclick = () => {
        ToggleSwitch.Tokens[`healthcare-healthcare-company-private-toggle`].click();
        ToggleSwitch.Tokens[`healthcare-healthcare-company-public-toggle`].click();
        mode = 'healthcare-company-private';
      };
      s(`.toggle-form-container-healthcare-healthcare-company-public`).onclick = () => {
        ToggleSwitch.Tokens[`healthcare-healthcare-company-private-toggle`].click();
        ToggleSwitch.Tokens[`healthcare-healthcare-company-public-toggle`].click();
        mode = 'healthcare-company-public';
      };
    });
    return html`
      ${dynamicCol({ containerSelector: id0DynamicCol, id: id0DynamicCol })}
      <form class="in">
        <div class="fl ${id0DynamicCol}">
          <div class="in fll ${id0DynamicCol}-col-a">
            <div class="in">
              ${await Input.instance({
                id: `healthcare-appointment-identityDocument`,
                type: 'text',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.instance('identityDocument')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
              })}
            </div>
            <div class="in">
              ${await Input.instance({
                id: `healthcare-appointment-patient`,
                type: 'text',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.instance('complete-name')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
              })}
            </div>
            <div class="in">
              ${await Input.instance({
                id: `healthcare-appointment-whatsappNumber`,
                type: 'tel',
                label: html`<i class="fa-solid fa-pen-to-square"></i> ${Translate.instance('whatsapp-number')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
              })}
            </div>
            <div class="in">
              ${await Input.instance({
                id: `healthcare-appointment-email`,
                type: 'email',
                label: html`<i class="fa-solid fa-envelope"></i> ${Translate.instance('email')}`,
                containerClass: 'inl section-mp width-mini-box input-container',
                placeholder: true,
                autocomplete: 'email',
              })}
            </div>

            <div class="in section-mp toggle-form-container hover">
              <div class="in input-label">
                <i class="fas fa-caret-right"></i> ${Translate.instance('healthcare-company')}
              </div>

              <div class="fl section-mp toggle-form-container-healthcare-healthcare-company-public">
                <div class="in fll" style="width: 70%">
                  <div class="in">${Translate.instance('healthcare-company-public')}</div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.instance({
                    id: 'healthcare-healthcare-company-public-toggle',
                    containerClass: 'inl',
                    checked: mode === 'healthcare-company-public',
                    disabledOnClick: true,
                    displayMode: 'checkbox',
                    on: {
                      unchecked: () => {},
                      checked: () => {},
                    },
                  })}
                </div>
              </div>

              <div class="fl section-mp toggle-form-container-healthcare-healthcare-company-private">
                <div class="in fll" style="width: 70%">
                  <div class="in">${Translate.instance('healthcare-company-private')}</div>
                </div>
                <div class="in fll" style="width: 30%">
                  ${await ToggleSwitch.instance({
                    id: 'healthcare-healthcare-company-private-toggle',
                    containerClass: 'inl',
                    checked: mode === 'healthcare-company-private',
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
          </div>
          <div class="in fll ${id0DynamicCol}-col-b">
            ${eventData
              ? html` <div class="in section-mp toggle-form-container hover">
                    <div class="in input-label"><i class="far fa-calendar"></i> ${Translate.instance('day')}</div>
                    <div class="in healthcare-calendar-info-value">${eventData.start.split('T')[0]}</div>
                    <div class="in input-label"><i class="far fa-clock"></i> ${Translate.instance('startTime')}</div>
                    <div class="in healthcare-calendar-info-value">
                      ${eventData.start.slice(0, -8).split('T')[1]} Hrs.
                    </div>
                    <div class="in input-label"><i class="far fa-clock"></i> ${Translate.instance('endTime')}</div>
                    <div class="in healthcare-calendar-info-value">
                      ${eventData.end.slice(0, -8).split('T')[1]} Hrs.
                    </div>
                    <div class="in input-label"><i class="fas fa-info-circle"></i> ${Translate.instance('info')}</div>
                    <div class="in">${eventData.event.description}</div>
                  </div>
                  <pre class="in hide">${JSON.stringify(eventData, null, 4)}</pre>`
              : ''}
          </div>
        </div>
        <div class="in">
          ${await BtnIcon.instance({
            class: 'in section-mp form-button btn-healthcare-appointment',
            label: Translate.instance('healthcare-appointment'),
            type: 'submit',
          })}
        </div>
      </form>
    `;
  }
}
export { AppointmentFormHealthcare };
