import { newInstance, getId, cap, capFirst } from './CommonJs.js';
import { DropDown } from './DropDown.js';
import { loggerFactory } from './Logger.js';
import { s, htmls, getLang } from './VanillaJs.js';

const logger = loggerFactory(import.meta);

const textFormatted = (str = '&nbsp &nbsp . . .') => capFirst(str.toLowerCase());

const Translate = {
  Data: {},
  Token: {},
  Event: {},
  Options: {},
  Parse: function (lang) {
    s('html').lang = lang;
    Object.keys(this.Token).map((translateHash) => {
      if (translateHash in this.Token && lang in this.Token[translateHash]) {
        if (!('placeholder' in this.Options[translateHash]) && s(`.${translateHash}`))
          htmls(
            `.${translateHash}`,
            this.Options[translateHash]?.disableTextFormat
              ? this.Token[translateHash][lang]
              : textFormatted(this.Token[translateHash][lang]),
          );
        else if ('placeholder' in this.Token[translateHash] && s(this.Token[translateHash].placeholder))
          s(this.Token[translateHash].placeholder).placeholder = this.Options[translateHash]?.disableTextFormat
            ? this.Token[translateHash][lang]
            : textFormatted(this.Token[translateHash][lang]);
      }
    });
    for (const keyEvent of Object.keys(this.Event)) this.Event[keyEvent]();
  },
  Render: function (keyLang, placeholder, options = { disableTextFormat: false }) {
    if (!(keyLang in this.Data)) {
      // TODO: add translate package or library for this case
      // logger.warn('translate key lang does not exist: ', keyLang);
      return options.disableTextFormat ? keyLang : textFormatted(keyLang);
    }
    if (placeholder) this.Data[keyLang].placeholder = placeholder;
    keyLang = this.Data[keyLang];
    const translateHash = getId(this.Token, 'trans');
    this.Options[translateHash] = options;
    this.Token[translateHash] = newInstance(keyLang);
    if ('placeholder' in keyLang) {
      if (s('html').lang in keyLang)
        return options.disableTextFormat ? keyLang[s('html').lang] : textFormatted(keyLang[s('html').lang]);
      return options.disableTextFormat ? keyLang['en'] : textFormatted(keyLang['en']);
    }
    if (s('html').lang in keyLang)
      return html`<span class="${translateHash}"
        >${options.disableTextFormat ? keyLang[s('html').lang] : textFormatted(keyLang[s('html').lang])}</span
      >`;
    return html`<span class="${translateHash}"
      >${options.disableTextFormat ? keyLang['en'] : textFormatted(keyLang['en'])}</span
    >`;
  },
  renderLang: function (language) {
    localStorage.setItem('lang', language);
    this.Parse(language);
    if (s(`.action-btn-lang-render`)) htmls(`.action-btn-lang-render`, s('html').lang);
  },
  RenderSetting: async function (id) {
    return html` <div class="in section-mp">
      ${await DropDown.Render({
        id: id ?? 'settings-lang',
        value: s('html').lang ? s('html').lang : 'en',
        label: html`${Translate.Render('lang')}`,
        data: ['en', 'es'].map((language) => {
          return {
            display: html`<i class="fa-solid fa-language"></i> ${Translate.Render(language)}`,
            value: language,
            onClick: () => Translate.renderLang(language),
          };
        }),
      })}
    </div>`;
  },
};

const TranslateCore = {
  Init: async function () {
    s('html').lang = getLang();
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
        es: 'Mínimo 2 caracteres, máximo 20 caracteres',
        en: 'Minimum 2 characters, maximum 20 characters',
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
      'error-username-invalid': {
        es: 'Nombre de usuario no válido. Debe contener solo letras, números y guiones bajos.',
        en: 'Invalid username. Must contain only letters, numbers, and underscores.',
      },
      'error-email-invalid': {
        es: 'Dirección de correo electrónico no válida.',
        en: 'Invalid email address.',
      },
      'error-password-invalid': {
        es: 'Contraseña no válida. Debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas, números y símbolos.',
        en: 'Invalid password. Must be at least 8 characters long and include uppercase, lowercase, numbers, and symbols.',
      },
      'error-username-taken': {
        es: 'Este nombre de usuario ya está en uso. Por favor, elige otro.',
        en: 'This username is already taken. Please choose another one.',
      },
      'error-email-taken': {
        es: 'Esta dirección de correo electrónico ya está registrada.',
        en: 'This email address is already registered.',
      },
      'error-register-user': {
        es: 'Error al registrar el usuario. Por favor, intenta nuevamente.',
        en: 'Error registering user. Please try again.',
      },
    };
    Translate.Data['isMobilePhone'] = {
      en: 'Invalid mobile phone number. Please check the format and try again.',
      es: 'Número de teléfono móvil no válido. Revisa el formato e intenta nuevamente.',
    };
    Translate.Data['whatsapp-number'] = {
      en: 'Enter your WhatsApp number, including your country code.',
      es: 'Número de WhatsApp, recuerda colocar el código de tu país',
    };
    Translate.Data['¿'] = {
      en: '',
      es: '¿',
    };
    Translate.Data['color-copy'] = { es: 'color copiado en el portapapeles', en: 'color copied to clipboard' };
    Translate.Data['pallet-colors'] = { en: 'pallet colors', es: 'paleta de colores' };
    Translate.Data['fullscreen'] = { en: 'Fullscreen', es: 'Pantalla completa' };
    Translate.Data['lang'] = { en: 'Language', es: 'Idioma' };
    Translate.Data['name'] = { en: 'Name', es: 'Nombre' };
    Translate.Data['select'] = { en: 'Select', es: 'Seleccionar' };
    Translate.Data['close'] = { en: 'Close', es: 'Cerrar' };
    Translate.Data['en'] = { en: 'English', es: 'Ingles' };
    Translate.Data['es'] = { en: 'Spanish', es: 'Español' };
    Translate.Data['theme'] = { en: 'Theme', es: 'Tema' };
    Translate.Data['success-upload-file'] = { en: 'file uploaded successfully', es: 'archivo subido correctamente' };
    Translate.Data['file'] = { en: 'file', es: 'archivo' };
    Translate.Data['error-upload-file'] = { en: 'error uploading file', es: 'error al subir el archivo' };
    Translate.Data['generate'] = { en: 'generate', es: 'Generar' };
    Translate.Data['download'] = { en: 'download', es: 'Descargar' };
    Translate.Data['delete'] = { en: 'delete', es: 'Eliminar' };
    Translate.Data['success-delete'] = { en: 'success delete item', es: 'Item eliminado con exito' };
    Translate.Data['document-now-public'] = { en: 'Document is now public', es: 'El documento ahora es público' };
    Translate.Data['document-now-private'] = { en: 'Document is now private', es: 'El documento ahora es privado' };
    Translate.Data['error-toggle-public'] = {
      en: 'Failed to toggle public status',
      es: 'Error al cambiar estado público',
    };
    Translate.Data['confirm-make-public'] = {
      en: 'Are you sure you want to make this document public?',
      es: '¿Estás seguro de que deseas hacer público este documento?',
    };
    Translate.Data['invalid-data'] = { en: 'Invalid data', es: 'Datos invalidos' };
    Translate.Data['upload'] = { en: 'upload', es: 'Subir' };
    Translate.Data['load'] = { en: 'load', es: 'Cargar' };
    Translate.Data['settings'] = { en: 'settings', es: 'configuraciones' };
    Translate.Data['search'] = { en: 'Search', es: 'Buscar' };
    Translate.Data['filter-by-file-name'] = { en: 'Filter by file name', es: 'Filtrar por nombre de archivo' };
    Translate.Data['view'] = { en: 'view', es: 'ver' };
    Translate.Data['user'] = { en: 'User', es: 'Usuario' };
    Translate.Data['pass'] = { en: 'Password', es: 'Contraseña' };
    Translate.Data['email'] = { en: 'Email', es: 'Correo Electronico' };
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
    Translate.Data['success-register-user'] = {
      en: 'user successfully registered',
      es: 'Usuario registrado con exito',
    };
    Translate.Data['no-valid-register'] = { en: 'No valid register', es: 'Registro no válido' };
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
    Translate.Data['error-user-not-authenticated'] = {
      en: 'You must be logged in to perform this action.',
      es: 'Debe iniciar sesión para realizar esta acción.',
    };
    Translate.Data['confirm-logout'] = { en: 'Confirm Logout', es: 'Confirmar cierre de sesión' };
    Translate.Data['success-logout'] = { en: 'Successful session logout', es: 'Cierre de sesión exitoso' };
    Translate.Data['account'] = { en: 'Account', es: 'Cuenta' };

    Translate.Data['update'] = { en: 'Update', es: 'Actualizar' };
    Translate.Data['success-update-user'] = { en: 'user update successfully', es: 'usuario actualizado correctamente' };
    Translate.Data['error-update-user'] = { en: 'error update user', es: 'error al actualizar el usuario' };

    Translate.Data['edit'] = { en: 'Edit', es: 'Editar' };
    Translate.Data['copy-share-link'] = { en: 'Copy share link', es: 'Copiar enlace compartido' };
    Translate.Data['link-copied'] = { en: 'Link copied to clipboard', es: 'Enlace copiado al portapapeles' };
    Translate.Data['error-copying-link'] = { en: 'Error copying link', es: 'Error al copiar enlace' };
    Translate.Data['unconfirmed'] = { en: 'unconfirmed', es: 'No confirmado' };
    Translate.Data['confirmed'] = { en: 'confirmed', es: 'Confirmado' };
    Translate.Data['confirm'] = { en: 'confirm', es: 'confirmar' };
    Translate.Data['cancel'] = { en: 'cancel', es: 'cancelar' };
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
    Translate.Data['file-upload-failed'] = { en: 'file upload failed', es: 'error al subir el archivo' };
    Translate.Data['current-path'] = { en: 'current path', es: 'ruta actual' };
    Translate.Data['go'] = { en: 'go', es: 'ir' };
    Translate.Data['home-directory'] = { en: 'Home directory', es: 'Directorio de inicio' };
    Translate.Data['create'] = { en: 'create', es: 'Crear' };
    Translate.Data['home'] = { en: 'Home', es: 'Inicio' };
    Translate.Data['calendar'] = { es: 'Calendario', en: 'Calendar' };
    Translate.Data['docs'] = { es: 'Documentacion', en: 'Documentation' };
    Translate.Data['clean-cache'] = { es: 'Limpiar caché', en: 'Clean cache' };

    Translate.Data['add'] = { es: 'Agregar', en: 'Add' };
    Translate.Data['mode'] = { es: 'Modo', en: 'Mode' };
    Translate.Data['result'] = { es: 'Resultado', en: 'Result' };
    Translate.Data['results'] = { es: 'Resultados', en: 'Results' };
    Translate.Data['no-result-found'] = {
      es: 'No se encontraron resultados',
      en: 'No results found',
    };
    Translate.Data['no-preview-available'] = {
      en: 'No preview available',
      es: 'Vista previa no disponible',
    };
    Translate.Data['recent'] = { es: 'Reciente', en: 'recent' };

    Translate.Data = {
      ...Translate.Data,
      ...{
        title: {
          en: 'Title Content Entry',
          es: 'Titulo de entrada',
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
          en: 'Content',
          es: 'Contenido',
        },
        _content: {
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
      },
    };
    Translate.Data['warning-upload-no-selects-file'] = {
      es: 'No ha seleccionado ningún archivo para subir.',
      en: 'No file selected for upload.',
    };
    Translate.Data['no-can-connect-stream-device'] = {
      es: 'No se pudo conectar al dispositivo de transmisión.',
      en: 'Unable to connect to the stream device.',
    };

    Translate.Data['equip'] = {
      es: 'Equipar',
      en: 'Equip',
    };
    Translate.Data['unequip'] = {
      es: 'Desequipar',
      en: 'Unequip',
    };

    Translate.Data['i-have-account'] = {
      en: 'I have an account',
      es: 'Tengo una cuenta',
    };
    Translate.Data['i-not-have-account'] = {
      en: 'I do not have an account',
      es: 'No tengo una cuenta',
    };
    Translate.Data['forgot-password'] = {
      en: 'Forgot Password',
      es: 'Olvidé mi contraseña',
    };
    Translate.Data['recover'] = {
      en: 'Recover',
      es: 'Recuperar',
    };
    Translate.Data['send-recover-verify-email'] = {
      en: 'Send recover email',
      es: 'Enviar email de recuperación',
    };
    Translate.Data['recover-verify-email'] = {
      en: 'recover email',
      es: 'email de recuperación',
    };
    Translate.Data['15-min-valid-recover-email'] = {
      en: 'The recovery email link will expire in 15 minutes.',
      es: 'El enlace de recuperación del email expirará en 15 minutos.',
    };
    Translate.Data['success-recover-verify-email'] = {
      en: 'Email send with recover password instructions.',
      es: 'Email enviado con instrucciones para recuperar contraseña.',
    };
    Translate.Data['error-recover-verify-email'] = {
      en: 'Error sending recover email.',
      es: 'Error al enviar email de recuperación.',
    };
    Translate.Data['success-recover-password'] = {
      en: 'Password successfully updated.',
      es: 'Contraseña actualizada con éxito.',
    };
    Translate.Data['error-recover-password'] = {
      en: 'Error updating password.',
      es: 'Error al actualizar la contraseña.',
    };
    Translate.Data['change-password'] = {
      en: 'Change Password',
      es: 'Cambiar contraseña',
    };
    Translate.Data['resend'] = { en: 'Resend', es: 'Reenviar' };
    Translate.Data['delete-account'] = { en: 'Delete Account', es: 'Borrar cuenta' };

    Translate.Data['doc-title'] = {
      en: 'Doc Title',
      es: 'Título del documento',
    };
    Translate.Data['md-file-name'] = {
      en: 'MD File Name',
      es: 'Nombre de archivo MD',
    };
    Translate.Data['generic-file-name'] = {
      en: 'Generic File Name',
      es: 'Nombre de archivo genérico',
    };
    Translate.Data['edit-document'] = {
      en: 'Edit Document',
      es: 'Editar documento',
    };
    Translate.Data['location'] = {
      en: 'Location',
      es: 'Ubicación',
    };
    Translate.Data['save'] = {
      en: 'Save',
      es: 'Guardar',
    };
    Translate.Data['success-update-document'] = {
      en: 'Document updated successfully.',
      es: 'Documento actualizado con éxito.',
    };
    Translate.Data['error-update-document'] = {
      en: 'Error updating document.',
      es: 'Error al actualizar el documento.',
    };
    Translate.Data['error-title-required'] = {
      en: 'Title is required.',
      es: 'El título es obligatorio.',
    };
    Translate.Data['editing'] = {
      en: 'Editing',
      es: 'Editando',
    };
    Translate.Data['no-md-file-attached'] = {
      en: 'No markdown file attached to this document',
      es: 'No hay archivo markdown adjunto a este documento',
    };
    Translate.Data['no-generic-file-attached'] = {
      en: 'No generic file attached to this document',
      es: 'No hay archivo genérico adjunto a este documento',
    };
    Translate.Data['success-delete-account'] = {
      en: 'Account deleted successfully.',
      es: 'Cuenta borrada con éxito.',
    };
    Translate.Data['error-delete-account'] = {
      en: 'Error deleting account.',
      es: 'Error al borrar la cuenta.',
    };

    Translate.Data['confirm-delete-account'] = {
      en: 'Are you sure you want to delete your account?',
      es: '¿Estás seguro de que deseas borrar tu cuenta?',
    };
    Translate.Data['default-management'] = {
      en: 'Default Management',
      es: 'Gestión por defecto',
    };
    Translate.Data['field'] = {
      en: 'Field',
      es: 'Campo',
    };
    Translate.Data['success-updated'] = {
      en: 'Successfully updated.',
      es: 'Actualizado con éxito.',
    };
    Translate.Data['item-success-delete'] = {
      en: 'Item successfully deleted.',
      es: 'Elemento eliminado con éxito.',
    };
    Translate.Data['success-delete-all-items'] = {
      en: 'All items successfully deleted.',
      es: 'Todos los elementos eliminados con éxito.',
    };
    Translate.Data['success-create-item'] = {
      en: 'Item successfully created.',
      es: 'Elemento creado con éxito.',
    };
    Translate.Data['user-management'] = {
      en: 'User Management',
      es: 'Gestión de usuarios',
    };
    Translate.Data['success-update-item'] = { en: 'Item successfully updated.', es: 'Elemento actualizado con éxito.' };
    Translate.Data['error-update-item'] = { en: 'Error updating item', es: 'Elemento actualizado con éxito.' };
    Translate.Data['instance-management'] = {
      en: 'Instance Management',
      es: 'Gestión de instancias',
    };
    Translate.Data['login-attempts-remaining'] = {
      en: 'Login attempts remaining:',
      es: 'Intentos de inicio de sesión restantes:',
    };
    Translate.Data['account-locked-try-again-in'] = {
      en: 'Account locked. Try again in:',
      es: 'Cuenta bloqueada. Intente nuevamente en:',
    };
    Translate.Data['pre-release'] = {
      en: 'Pre release',
      es: 'Pre lanzamiento',
    };
    Translate.Data['all-day'] = {
      en: 'Every day',
      es: 'Todos los días',
    };
    Translate.Data['allDay'] = Translate.Data['all-day'];
    Translate.Data['allday'] = Translate.Data['all-day'];
    Translate.Data['month'] = {
      en: 'Month',
      es: 'Mes',
    };
    Translate.Data['week'] = {
      en: 'Week',
      es: 'Semana',
    };
    Translate.Data['summary'] = {
      en: 'Summary',
      es: 'Resumen',
    };
    Translate.Data['today'] = {
      en: 'Today',
      es: 'Hoy',
    };
    Translate.Data['success-add-event-scheduler'] = {
      en: 'Event successfully added to scheduler.',
      es: 'Evento añadido correctamente al calendario.',
    };
    Translate.Data['success-edit-event-scheduler'] = {
      en: 'Event successfully updated to scheduler.',
      es: 'Evento actualizado correctamente al calendario.',
    };
    Translate.Data['success-get-events-scheduler'] = {
      en: 'Events successfully retrieved from scheduler.',
      es: 'Eventos obtenidos correctamente del calendario.',
    };
    Translate.Data['success-add-post'] = {
      en: 'Post added successfully',
      es: 'Post añadido con éxito',
    };
    Translate.Data['success-get-posts'] = {
      en: 'Posts successfully retrieved',
      es: 'Posts obtenidos con éxito',
    };
    Translate.Data['confirm-delete-item'] = {
      en: 'Are you sure you want to delete this item?',
      es: '¿Estás seguro de que deseas eliminar este elemento?',
    };
    Translate.Data['success-edit-post'] = {
      en: 'Post edited successfully',
      es: 'Post editado con éxito',
    };
    Translate.Data['confirm-delete-all-data'] = {
      en: 'Are you sure you want to delete all data?',
      es: 'Estas seguro de eliminar todos los datos?',
    };
    Translate.Data['charge-complete'] = {
      en: 'Charge complete',
      es: 'Carga completada',
    };
    Translate.Data['play'] = { es: 'Jugar', en: 'Play' };
    Translate.Data['pause'] = { es: 'Pausar', en: 'Pause' };
    Translate.Data['stop'] = { es: 'Parar', en: 'Stop' };
    Translate.Data['previous'] = { es: 'Anterior', en: 'Previous' };
    Translate.Data['next'] = { es: 'Siguiente', en: 'Next' };
    Translate.Data['buy'] = { es: 'comprar', en: 'Buy' };
    Translate.Data['sell'] = { es: 'Vender', en: 'sell' };

    Translate.Data['monday'] = { es: 'Lunes', en: 'Monday' };
    Translate.Data['tuesday'] = { es: 'Martes', en: 'Tuesday' };
    Translate.Data['wednesday'] = { es: 'Miércoles', en: 'Wednesday' };
    Translate.Data['thursday'] = { es: 'Jueves', en: 'Thursday' };
    Translate.Data['friday'] = { es: 'Viernes', en: 'Friday' };
    Translate.Data['saturday'] = { es: 'Sábado', en: 'Saturday' };
    Translate.Data['sunday'] = { es: 'Domingo', en: 'Sunday' };

    Translate.Data['description'] = { es: 'Descripción', en: 'Description' };
    Translate.Data['daysOfWeek'] = { es: 'Días de la semana', en: 'Days of the week' };
    Translate.Data['startTime'] = { es: 'Hora de inicio', en: 'Start time' };
    Translate.Data['endTime'] = { es: 'Hora de finalizacion', en: 'End time' };
    Translate.Data['appointment-scheduled'] = {
      en: 'Your appointment has been scheduled',
      es: 'Tu cita ha sido programada',
    };
    Translate.Data['info'] = { es: 'Información', en: 'Info' };
    Translate.Data['complete-name'] = { es: 'Nombre completo', en: 'Complete name' };
    Translate.Data['identityDocument'] = { es: 'Rut', en: 'Identity document' };
    Translate.Data['day'] = { es: 'Día', en: 'Day' };
    Translate.Data['month'] = { es: 'Mes', en: 'Month' };
    Translate.Data['year'] = { es: 'Año', en: 'Year' };
    Translate.Data['phone'] = { es: 'Teléfono', en: 'Phone' };
    Translate.Data['invalid-identity-document'] = {
      en: 'Invalid identity document',
      es: 'Documento de identidad inválido',
    };
    Translate.Data['expired-session'] = {
      en: 'Your session has expired. Please log in again.',
      es: 'Su sesión ha expirado. Por favor, inicie sesión de nuevo.',
    };
    Translate.Data['cron-management'] = {
      en: 'Cron Management',
      es: 'Gestion de cron jobs',
    };
    Translate.Data['success-reload-data'] = {
      en: 'Data reloaded successfully.',
      es: 'Datos recargados con éxito.',
    };
    Translate.Data['clear-file'] = {
      en: 'Clear File',
      es: 'Limpiar Archivos',
    };
    Translate.Data['require-title-and-content-or-file'] = {
      en: 'Require title and content or file',
      es: 'Requiere título y contenido o archivo',
    };
    Translate.Data['public-profile'] = {
      en: 'Public Profile',
      es: 'Perfil Público',
    };
    Translate.Data['private-profile'] = {
      en: 'Private Profile',
      es: 'Perfil Privado',
    };
    Translate.Data['brief-description'] = {
      en: 'Brief Description',
      es: 'Descripción Breve',
    };
    Translate.Data['brief-description-cannot-be-empty'] = {
      en: 'Brief description cannot be empty',
      es: 'La descripción breve no puede estar vacía',
    };
    Translate.Data['user-not-found'] = {
      en: 'User not found',
      es: 'Usuario no encontrado',
    };
    Translate.Data['error-loading-profile'] = {
      en: 'Error loading profile',
      es: 'Error al cargar el perfil',
    };
    Translate.Data['profile-is-private'] = {
      en: 'This profile is private',
      es: 'Este perfil es privado',
    };
    Translate.Data['no-description'] = {
      en: 'No description provided',
      es: 'Sin descripción',
    };
    Translate.Data['member-since'] = {
      en: 'Member since',
      es: 'Miembro desde',
    };
    Translate.Data['followers'] = {
      en: 'Followers',
      es: 'Seguidores',
    };
    Translate.Data['following'] = {
      en: 'Following',
      es: 'Siguiendo',
    };
    Translate.Data['invalid-username-format'] = {
      en: 'Username can only contain letters, numbers, hyphens, and underscores',
      es: 'El nombre de usuario solo puede contener letras, números, guiones e guiones bajos',
    };
    Translate.Data['go-home'] = {
      en: 'Go Home',
      es: 'Ir a Inicio',
    };
    Translate.Data['go-back'] = {
      en: 'Go Back',
      es: 'Volver',
    };
    Translate.Data['public-profile'] = {
      en: 'Public Profile',
      es: 'Perfil Público',
    };
    Translate.Data['external-link-warning'] = {
      en: 'You are about to open an external link. Do you want to continue?',
      es: 'Está a punto de abrir un enlace externo. ¿Desea continuar?',
    };
  },
};

export { Translate, TranslateCore, textFormatted };
