import { Translate } from '../core/Translate.js';

const TranslateHealthcare = {
  Init: async function () {
    // Translate.Data['isMobilePhone'] = { en: '', es: '' };
    Translate.Data['healthcare'] = { en: 'healthcare', es: 'salud' };
    Translate.Data['healthcare-appointment'] = { en: 'Healthcare appointment', es: 'Agendar consulta' };
    Translate.Data['patient'] = { en: 'patient', es: 'paciente' };
    Translate.Data['whatsapp-number'] = {
      en: 'Enter your WhatsApp number, including your country code.',
      es: 'Número de WhatsApp, recuerda colocar el código de tu país',
    };
  },
};

export { TranslateHealthcare };
