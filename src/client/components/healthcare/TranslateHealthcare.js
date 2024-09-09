import { Translate } from '../core/Translate.js';
import { medicalSpecialties } from './CommonHealthcare.js';

const TranslateHealthcare = {
  Init: async function () {
    // Translate.Data['isMobilePhone'] = { en: '', es: '' };
    Translate.Data['healthcare'] = { en: 'healthcare', es: 'salud' };
    Translate.Data['healthcare-appointment'] = { en: 'Healthcare appointment', es: 'Agendar consulta' };
    Translate.Data['patient'] = { en: 'patient', es: 'paciente' };
    Translate.Data['in-person'] = { en: 'in-person', es: 'presencial' };
    Translate.Data['telemedicine'] = { en: 'telemedicine', es: 'telemedicina' };
    medicalSpecialties.map((o) => {
      Translate.Data[o.id] = o.displayName;
    });
  },
};

export { TranslateHealthcare };
