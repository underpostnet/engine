import { Translate } from '../core/Translate.js';
import { NutritionalTips, medicalSpecialties, MenuHomeHealthcare } from './CommonHealthcare.js';

const TranslateHealthcare = {
  Init: async function () {
    // Translate.Data['isMobilePhone'] = { en: '', es: '' };
    Translate.Data['healthcare'] = { en: 'healthcare', es: 'salud' };
    Translate.Data['healthcare-appointment'] = { en: 'Healthcare appointment', es: 'Agendar consulta' };
    Translate.Data['patient'] = { en: 'patient', es: 'paciente' };
    Translate.Data['in-person'] = { en: 'in-person', es: 'presencial' };
    Translate.Data['telemedicine'] = { en: 'telemedicine', es: 'telemedicina' };
    Translate.Data['home-getting'] = { en: 'What do you want to do?', es: 'Qué quieres hacer?' };
    Translate.Data['healthcare-company'] = { en: 'Healthcare Insurance', es: 'Prevision' };
    Translate.Data['healthcare-company-private'] = { en: 'Private Healthcare Insurance', es: 'Particular' };
    Translate.Data['healthcare-company-public'] = { en: 'Public Healthcare Insurance', es: 'Fonasa' };
    Translate.Data['success-healthcare-appointment'] = {
      es: 'Gracias tu hora ha sido agendada, prontamente la Nutricionista se contactará con usted para confirmar la cita',
      en: 'Thank you for your appointment, soon the Nutritionist will contact you to confirm the appointment',
    };
    Translate.Data['record-mood-title'] = {
      es: 'Registra tu estado de ánimo',
      en: 'Record your mood',
    };

    Object.keys(MenuHomeHealthcare).map((id) => {
      Translate.Data[id] = MenuHomeHealthcare[id].displayName;
    });

    medicalSpecialties.map((o) => {
      Translate.Data[o.id] = o.displayName;
    });

    NutritionalTips.map((v, i) => {
      Translate.Data[`nutrition-tips-${i}`] = v.displayName;
    });
  },
};

export { TranslateHealthcare };
