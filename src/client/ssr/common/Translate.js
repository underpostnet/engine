const TranslateCore = {
  ['server-maintenance']: {
    en: "The server is under maintenance <br> we'll be back soon.",
    es: 'El servidor está en mantenimiento <br> volveremos pronto.',
  },
};

const Translate = (key) => TranslateCore[key][getLang().match('es') ? 'es' : 'en'];

export { Translate };
