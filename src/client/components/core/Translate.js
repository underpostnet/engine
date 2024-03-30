import { newInstance, getId } from './CommonJs.js';
import { loggerFactory } from './Logger.js';
import { s, htmls } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const Translate = {
  Data: {},
  Token: {},
  Parse: function (lang) {
    s('html').lang = lang;
    Object.keys(this.Token).map((translateHash) => {
      if (translateHash in this.Token && lang in this.Token[translateHash]) {
        if (!('placeholder' in this.Token[translateHash]) && s(`.${translateHash}`))
          htmls(`.${translateHash}`, this.Token[translateHash][lang]);
        else if ('placeholder' in this.Token[translateHash] && s(this.Token[translateHash].placeholder))
          s(this.Token[translateHash].placeholder).placeholder = this.Token[translateHash][lang];
      }
    });
  },
  Render: function (keyLang) {
    if (!(keyLang in this.Data)) {
      // TODO: add translate package or library for this case
      logger.warn('translate key lang does not exist: ', keyLang);
      return keyLang;
    }
    keyLang = this.Data[keyLang];
    const translateHash = getId(this.Token, 'trans');
    this.Token[translateHash] = newInstance(keyLang);
    if ('placeholder' in keyLang) {
      if (s('html').lang in keyLang) return keyLang[s('html').lang];
      return keyLang['en'];
    }
    if (s('html').lang in keyLang) return html`<span class="${translateHash}">${keyLang[s('html').lang]}</span>`;
    return html`<span class="${translateHash}">${keyLang['en']}</span>`;
  },
};

const TranslateCore = {
  Init: async function () {
    if (localStorage.getItem('lang')) s('html').lang = localStorage.getItem('lang');
    Translate.Data = {
      ...Translate.Data,
      isEmpty: {
        es: 'Este campo no puede estar vacío',
        en: 'This field cannot be empty',
      },
      isEmail: {
        es: 'Por favor, introduce una dirección de correo electrónico válida',
        en: 'Please enter a valid email address',
      },
      isLength: {
        es: 'Mínimo 5 caracteres, máximo 20 caracteres',
        en: 'Minimum 5 characters, maximum 20 characters',
      },
      passwordMismatch: {
        es: 'Las contraseñas no coinciden',
        en: 'Passwords do not match',
      },
      invalidPhoneNumber: {
        es: 'Por favor, introduce un número de teléfono válido',
        en: 'Please enter a valid phone number',
      },
      invalidDate: {
        es: 'Por favor, introduce una fecha válida',
        en: 'Please enter a valid date',
      },
      customValidator: {
        es: 'Este campo no cumple con los requisitos específicos',
        en: 'This field does not meet specific requirements',
      },
    };
    Translate.Data['color-copy'] = { es: 'color copiado en el portapapeles', en: 'color copied to clipboard' };
    Translate.Data['pallet-colors'] = { en: 'pallet colors', es: 'paleta de colores' };
    Translate.Data['fullscreen'] = { en: 'fullscreen', es: 'pantalla completa' };
    Translate.Data['lang'] = { en: 'Language', es: 'Idioma' };
    Translate.Data['name'] = { en: 'Name', es: 'Nombre' };
    Translate.Data['select'] = { en: 'Select', es: 'Seleccionar' };
    Translate.Data['close'] = { en: 'Close', es: 'Cerrar' };
    Translate.Data['en'] = { en: 'English', es: 'Ingles' };
    Translate.Data['es'] = { en: 'Spanish', es: 'Español' };
    Translate.Data['theme'] = { en: 'Theme', es: 'Tema' };
    Translate.Data['success-upload-file'] = { en: 'file uploaded successfully', es: 'archivo subido correctamente' };
    Translate.Data['error-upload-file'] = { en: 'error uploading file', es: 'error al subir el archivo' };
    Translate.Data['generate'] = { en: 'generate', es: 'Generar' };
    Translate.Data['download'] = { en: 'download', es: 'Descargar' };
    Translate.Data['delete'] = { en: 'delete', es: 'Eliminar' };
    Translate.Data['success-delete'] = { en: 'success delete item', es: 'Item eliminado con exito' };
    Translate.Data['invalid-data'] = { en: 'Invalid data', es: 'Datos invalidos' };
    Translate.Data['upload'] = { en: 'upload', es: 'Subir' };
    Translate.Data['load'] = { en: 'load', es: 'Cargar' };
    Translate.Data['settings'] = { en: 'settings', es: 'configuraciones' };
    Translate.Data['search'] = { en: 'search', es: 'buscar' };
    Translate.Data['view'] = { en: 'view', es: 'ver' };
    Translate.Data['user'] = { en: 'User', es: 'Usuario' };
    Translate.Data['pass'] = { en: 'Password', es: 'Contraseña' };
    Translate.Data['email'] = { en: 'Email', es: 'Email' };
    Translate.Data['clear'] = { en: 'Reset', es: 'Limpiar' };
    Translate.Data['select-role'] = { en: 'Select Role', es: 'Seleccionar Rol' };
    Translate.Data['sign-up'] = { en: 'Sign Up', es: 'Registrarse' };
    Translate.Data['log-in'] = { en: 'Log In', es: 'Ingresar' };
    Translate.Data['log-out'] = { en: 'Log Out', es: 'Cerrar Sesión' };
    Translate.Data['broker'] = { en: 'Broker', es: 'Agente de ventas' };
    Translate.Data['owner'] = { en: 'Owner', es: 'Propietario' };
    Translate.Data['password'] = { en: 'Password', es: 'Contraseña' };
    Translate.Data['repeat'] = { en: 'Repeat', es: 'Repetir' };
    Translate.Data['username'] = { en: 'username', es: 'Nombre de usuario' };
    Translate.Data['success-upload-user'] = { en: 'user uploaded successfully', es: 'usuario subido correctamente' };
    Translate.Data['error-upload-user'] = { en: 'error uploading user', es: 'error al subir el usuario' };
    Translate.Data['success-user'] = { en: 'user/s successfully obtained', es: 'Usuario/s obtenido correctamente' };
    Translate.Data['width'] = { en: 'width', es: 'ancho' };
    Translate.Data['height'] = { en: 'height', es: 'altura' };
    Translate.Data['type'] = { en: 'Type', es: 'Tipo' };
    Translate.Data['write'] = { en: 'write', es: 'escribir' };
    Translate.Data['send'] = { en: 'Send', es: 'Enviar' };
    Translate.Data['success-user-log-in'] = {
      en: 'User successfully logged in.',
      es: 'Usuario ha iniciado sesión exitosamente.',
    };
    Translate.Data['error-user-log-in'] = {
      en: 'Error during user login. Please check your credentials and try again.',
      es: 'Error durante el inicio de sesión del usuario. Por favor, verifica tus credenciales e intenta nuevamente.',
    };
    Translate.Data['confirm-logout'] = { en: 'Confirm Logout', es: 'Confirmar cierre de sesión' };
    Translate.Data['success-logout'] = { en: 'Successful session logout', es: 'Cierre de sesión exitoso' };
    Translate.Data['account'] = { en: 'Account', es: 'Cuenta' };

    Translate.Data['update'] = { en: 'Update', es: 'Actualizar' };
    Translate.Data['success-update-user'] = { en: 'user update successfully', es: 'usuario actualizado correctamente' };
    Translate.Data['error-update-user'] = { en: 'error update user', es: 'error al actualizar el usuario' };

    Translate.Data['edit'] = { en: 'Edit', es: 'Editar' };
    Translate.Data['unconfirmed'] = { en: 'unconfirmed', es: 'No confirmado' };
    Translate.Data['confirmed'] = { en: 'confirmed', es: 'Confirmado' };
    Translate.Data['confirm'] = { en: 'confirm', es: 'confirmar' };
    Translate.Data['verify-email'] = { en: 'Verify email', es: 'email de verificacion' };

    Translate.Data[`email send`] = { en: 'email send', es: 'email enviado' };

    Translate.Data['success-generate-keys'] = { en: 'Keys generated successfully.', es: 'Llaves generadas con éxito.' };
    Translate.Data['error-generate-keys'] = { en: 'Error generating keys.', es: 'Error al generar las llaves.' };

    Translate.Data['copy'] = { en: 'Copy', es: 'Copiar' };
    Translate.Data['keys'] = { en: 'Keys', es: 'Llaves' };

    Translate.Data['success-copy-data'] = { es: '¡Datos copiados con éxito!', en: 'Data copied successfully!' };

    Translate.Data['character'] = { es: 'Personaje', en: 'Character' };
    Translate.Data['file-path'] = { en: 'file path', es: 'ruta de archivo' };
    Translate.Data['drop-file'] = { en: 'drop file', es: 'soltar archivo' };
    Translate.Data['current-path'] = { en: 'current path', es: 'ruta actual' };
    Translate.Data['go'] = { en: 'go', es: 'ir' };
    Translate.Data['home-directory'] = { en: 'Home directory', es: 'Directorio de inicio' };
    Translate.Data['create'] = { en: 'create', es: 'Crear' };
    Translate.Data['home'] = { en: 'Home', es: 'Inicio' };
    Translate.Data['calendar'] = { es: 'Calendario', en: 'Calendar' };
    Translate.Data['docs'] = { es: 'Documentacion', en: 'Documentation' };

    Translate.Data = {
      ...Translate.Data,
      ...{
        title: {
          en: 'New Content Entry',
          es: 'Nueva entrada de blog',
        },
        author: {
          en: 'Author',
          es: 'Autor',
        },
        date: {
          en: 'Published on',
          es: 'Publicado el',
        },
        content: {
          en: 'This is the content of the new blog entry.',
          es: 'Este es el contenido de la nueva entrada de blog.',
        },
        tags: {
          en: 'Tags',
          es: 'Etiquetas',
        },
        categories: {
          en: 'Categories',
          es: 'Categorías',
        },
        comments: {
          en: 'Comments',
          es: 'Comentarios',
        },
      },
    };
  },
};

export { Translate, TranslateCore };
