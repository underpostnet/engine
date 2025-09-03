import nodemailer from 'nodemailer';
import { loggerFactory } from '../server/logger.js';
import { EmailRender } from './EmailRender.js';

const logger = loggerFactory(import.meta);

const MailerProvider = {
  instance: {},
  load: async function (
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
        rejectUnauthorized: false,
      };
      const { id } = options;
      // Generate test SMTP service account from ethereal.email
      // Only needed if you don't have a real mail account for testing
      // let testAccount = await nodemailer.createTestAccount();

      // create reusable transporter object using the default SMTP transport
      const transporter = nodemailer.createTransport(options.transport);

      // console.log('load logger', { url: options.meta });
      this.instance[id] = {
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

      return this.instance[id];
    } catch (error) {
      logger.error(error, error.stack);
      return undefined;
    }
  },
  send: async function (
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
      if (!sendOptions.from) sendOptions.from = `${this.instance[id].sender.name} <${this.instance[id].sender.email}>`;

      // send mail with defined transport object
      const info = await this.instance[id].transporter.sendMail(sendOptions);

      // console.log('Message sent: %s', info.messageId);
      // logger.info('Message sent', info);

      // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

      // Preview only available when sending through an Ethereal account
      // console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...

      return info;
    } catch (error) {
      logger.error(error, error.stack);
      return undefined;
    }
  },
};

export { MailerProvider };
