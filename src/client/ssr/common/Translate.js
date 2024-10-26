const TranslateCore = {
  ['server-maintenance']: {
    en: "The server is under maintenance <br> we'll be back soon.",
    es: 'El servidor está en mantenimiento <br> volveremos pronto.',
  },
  ['no-internet-connection']: {
    en: 'No internet connection <br> verify your network',
    es: 'Sin conexión a internet <br> verifica tu red',
  },
  ['page-not-found']: {
    en: 'Page not found',
    es: 'Página no encontrada',
  },
  ['page-broken']: {
    es: 'Algo salio mal',
    en: 'Something went wrong',
  },
  ['back']: {
    en: 'Back to <br>  homepage',
    es: 'Volver a  <br> la pagina principal',
  },
};

const Translate = (key) => TranslateCore[key][getLang().match('es') ? 'es' : 'en'];

export { Translate };
