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
    Translate.Data['forecast'] = { en: 'Forecast', es: 'Prevision' };
    Translate.Data['forecast-private'] = { en: 'Forecast private', es: 'Particular' };
    Translate.Data['forecast-public'] = { en: 'Forecast public', es: 'Fonasa' };
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
