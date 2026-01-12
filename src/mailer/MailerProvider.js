import nodemailer from 'nodemailer';
import { loggerFactory } from '../server/logger.js';
import { EmailRender } from './EmailRender.js';

/**
 * Module for configuring and sending emails using Nodemailer.
 * @module src/mailer/MailerProvider.js
 * @namespace MailerProviderNamespace
 */

const logger = loggerFactory(import.meta);

/**
 * @typedef {object} MailerOptions
 * @property {string} id - Unique identifier for the mailer configuration.
 * @property {string} [meta='mailer'] - Meta identifier for logging/context.
 * @property {object} sender - The default sender details.
 * @property {string} sender.email - The default sender email address.
 * @property {string} sender.name - The default sender name.
 * @property {object} transport - Nodemailer transport configuration.
 * @property {string} transport.host - SMTP host.
 * @property {number} [transport.port=587] - SMTP port.
 * @property {boolean} [transport.secure=false] - Use TLS (true for 465, false for other ports).
 * @property {object} transport.auth - Authentication details.
 * @property {string} transport.auth.user - Username.
 * @property {string} transport.auth.pass - Password.
 * @property {string} [host=''] - Application host for context.
 * @property {string} [path=''] - Application path for context.
 * @property {object.<string, string>} templates - Map of template keys to SSR component file names.
 * @memberof MailerProviderNamespace
 */

/**
 * @class
 * @alias MailerProviderService
 * @memberof MailerProviderNamespace
 * @classdesc Manages multiple Nodemailer transporter instances and handles loading of
 * email templates and sending emails.
 */
class MailerProviderService {
  /**
   * Internal storage for mailer instances (transporters, options, templates), keyed by ID.
   * @type {object.<string, object>}
   * @method
   */
  #instance = {};

  /**
   * Retrieves the internal instance storage for direct access (used for backward compatibility).
   * @returns {object.<string, object>} The internal mailer instance map.
   */
  get instance() {
    return this.#instance;
  }

  /**
   * Loads and initializes a new mailer provider instance using Nodemailer.
   * The created instance is stored internally and includes the transporter and rendered templates.
   *
   * @async
   * @param {MailerOptions} [options] - Configuration options for the mailer instance.
   * @returns {Promise<object|undefined>} A promise that resolves to the initialized mailer instance
   * object, or `undefined` on error.
   */
  async load(
    options = {
      id: '',
      meta: 'mailer',
      sender: {
        email: '',
        name: '',
      },
      transport: {
        host: '', // smtp host
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: '', // generated ethereal user
          pass: '', // generated ethereal password
        },
      },
      host: '',
      path: '',
      templates: {
        userVerifyEmail: 'DefaultVerifyEmail',
        userRecoverEmail: 'DefaultRecoverEmail',
      },
    },
  ) {
    try {
      options.transport.tls = {
        rejectUnauthorized: false, // allows self-signed certs for local/dev
      };
      const { id } = options;

      const transporter = nodemailer.createTransport(options.transport);

      this.#instance[id] = {
        ...options,
        transporter,
        templates: await EmailRender.getTemplates(options),
        translateTemplates: {
          confirmEmail: {
            H1: {
              en: 'Confirm Your Email',
              es: 'Confirma tu correo electrónico',
            },
            P1: {
              en: `Email confirmed! Thanks.
               <br />
             <span style="font-size: 12px; color: gray">
                If it is not automatically verified,
                please allow the image to be seen, thank you.
             </span>
              `,
              es: `Correo electrónico confirmado! Gracias.
              <br />
              <span style="font-size: 12px; color: gray">
               Si no se verifica automáticamente, por favor permita que se vea la imagen, gracias.
              </span>
              `,
            },
          },
          recoverEmail: {
            H1: {
              en: 'Recover your account',
              es: 'Recupera tu cuenta',
            },
            P1: {
              en: 'To recover your account, please click the button below:',
              es: 'Para recuperar tu cuenta, haz click en el botón de abajo:',
            },
            BTN_LABEL: {
              en: 'Recover Password',
              es: 'Recuperar Contraseña',
            },
          },
        },
      };

      return this.#instance[id];
    } catch (error) {
      logger.error(error, error.stack);
      return undefined;
    }
  }

  /**
   * Sends an email using a previously loaded transporter instance.
   *
   * @async
   * @param {object} [options] - Options for sending the email.
   * @param {string} options.id - The ID of the mailer instance/transporter to use.
   * @param {object} options.sendOptions - Nodemailer mail options.
   * @param {string} [options.sendOptions.from] - Sender address (defaults to loaded instance sender).
   * @param {string} options.sendOptions.to - List of receivers (comma-separated).
   * @param {string} options.sendOptions.subject - Subject line.
   * @param {string} [options.sendOptions.text] - Plain text body.
   * @param {string} [options.sendOptions.html] - HTML body.
   * @returns {Promise<object|undefined>} A promise that resolves to the Nodemailer `info` object, or `undefined` on error.
   */
  async send(
    options = {
      id: '',
      sendOptions: {
        from: '"Fred Foo 👻" <foo@example.com>', // sender address
        to: 'bar@example.com, baz@example.com', // list of receivers
        subject: 'Hello ✔', // Subject line
        text: 'Hello world?', // plain text body
        html: '<b>Hello world?</b>', // html body
        attachments: [
          {
            filename: 'logo.png',
            path: `./logo.png`,
            cid: 'logo', // <img src='cid:logo'>
          },
        ],
      },
    },
  ) {
    try {
      const { id, sendOptions } = options;
      const instance = this.#instance[id];

      if (!instance) {
        logger.error(`Mailer instance with ID '${id}' not loaded.`);
        return undefined;
      }

      if (!sendOptions.from) sendOptions.from = `${instance.sender.name} <${instance.sender.email}>`;

      // send mail with defined transport object
      const info = await instance.transporter.sendMail(sendOptions);

      // logger.info('Message sent', info);

      return info;
    } catch (error) {
      logger.error(error, error.stack);
      return undefined;
    }
  }
}

/**
 * Singleton instance of the MailerProviderService class for backward compatibility.
 * @alias MailerProvider
 * @memberof MailerProviderNamespace
 * @type {MailerProviderService}
 */
const MailerProvider = new MailerProviderService();

export { MailerProvider, MailerProviderService as MailerProviderClass };
