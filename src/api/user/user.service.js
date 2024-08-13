import { loggerFactory } from '../../server/logger.js';
import { hashPassword, verifyPassword, hashJWT, verifyJWT } from '../../server/auth.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';
import { CoreWsMailerManagement } from '../../ws/core/management/core.ws.mailer.js';
import { CoreWsEmit } from '../../ws/core/core.ws.emit.js';
import { CoreWsMailerChannel } from '../../ws/core/channels/core.ws.mailer.js';
import validator from 'validator';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { s4 } from '../../client/components/core/CommonJs.js';
import { FileFactory } from '../file/file.service.js';
import fs from 'fs-extra';
import { svg } from 'font-awesome-assets';

const logger = loggerFactory(import.meta);

const select = {
  'all-name': { _id: 1, name: 1 },
  auth: { _id: 1, username: 1, email: 1, role: 1, emailConfirmed: 1, profileImageId: 1 },
};

const UserService = {
  post: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;
    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;

    let result, user, _id, save, find, login;
    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            case 'verify-email':
              {
                if (!validator.isEmail(req.body.email)) throw { message: 'invalid email' };

                const token = hashJWT({ email: req.body.email });
                const id = `${options.host}${options.path}`;
                const user = await User.findById(req.auth.user._id);

                if (user.email !== req.body.email) {
                  req.body.emailConfirmed = false;

                  const result = await User.findByIdAndUpdate(req.auth.user._id, req.body, {
                    runValidators: true,
                  });
                }

                const sendResult = await MailerProvider.send({
                  id,
                  sendOptions: {
                    to: req.body.email, // req.auth.user.email, // list of receivers
                    subject: 'Email Confirmed', // Subject line
                    text: 'Email Confirmed', // plain text body
                    html: MailerProvider.instance[id].templates.userVerifyEmail.replace('{{TOKEN}}', token), // html body
                    attachments: [
                      // {
                      //   filename: 'logo.png',
                      //   path: `./logo.png`,
                      //   cid: 'logo', // <img src='cid:logo'>
                      // },
                    ],
                  },
                });

                if (!sendResult) throw { message: 'email send error' };
                result = { message: 'email send successfully' };
              }
              break;
            default:
              break;
          }
          break;

        default:
          break;
      }
      return result;
    }
    switch (req.params.id) {
      case 'auth':
        user = await User.find({
          email: req.body.email,
        });
        if (user[0]) {
          login = await verifyPassword(req.body.password, user[0].password);
          find = await User.find({
            _id: user[0]._id.toString(),
          }).select(select['auth']);
          user = find[0];
          if (login === true) {
            result = {
              token: hashJWT({ user }),
              user,
            };
          }
        }
        break;

      default:
        req.body.password = await hashPassword(req.body.password);
        req.body.role = 'user';
        {
          const faId = 'user';
          const tmpFilePath = `./tmp/${faId}-${s4() + s4()}.svg`;
          fs.writeFileSync(tmpFilePath, svg(faId, '#5f5f5f'), 'utf8');
          const file = await new File(FileFactory.svg(fs.readFileSync(tmpFilePath), `${faId}.svg`)).save();
          fs.removeSync(tmpFilePath);
          req.body.profileImageId = file._id;
        }
        save = await new User(req.body).save();
        _id = save._id;
        find = await User.find({ _id }).select(select['auth']);
        user = find[0];
        result = {
          token: hashJWT({ user }),
          user,
        };
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    let result = {};
    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            default:
              {
                result = await verifyJWT(req.params.id);
                const [user] = await User.find({
                  email: result.email,
                });

                if (user) {
                  user.emailConfirmed = true;
                  result = await User.findByIdAndUpdate(user._id.toString(), user, { runValidators: true });
                  const userWsId = CoreWsMailerManagement.getUserWsId(
                    `${options.host}${options.path}`,
                    user._id.toString(),
                  );
                  CoreWsEmit(CoreWsMailerChannel.channel, CoreWsMailerChannel.client[userWsId], {
                    status: 'email-confirmed',
                    id: userWsId,
                  });
                  result = { message: 'email confirmed' };
                } else throw { message: 'email user not found' };
              }
              break;
          }
          break;

        default:
          break;
      }
      return result;
    }
    switch (req.params.id) {
      case 'all':
        result = await User.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      case 'auth':
        result = await User.find({
          _id: req.auth.user._id,
        }).select(select['auth']);
        break;

      default:
        result = await User.find({
          _id: req.params.id,
        });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await User.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    let result, find;
    switch (req.params.id) {
      default:
        // if (req.body.password) req.body.password = await hashPassword(req.body.password);
        delete req.body.password;
        if (req.body.email !== req.auth.user.email) req.body.emailConfirmed = false;
        result = await User.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
        find = await User.find({
          _id: result._id.toString(),
        }).select(select['auth']);
        result = find[0];
        break;
    }
    return result;
  },
};

export { UserService };
