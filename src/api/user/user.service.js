import { loggerFactory } from '../../server/logger.js';
import { UserModel } from './user.model.js';
import { endpointFactory } from '../../client/components/core/CommonJs.js';
import { getPasswordHash, getToken, jwtVerify, tokenVerify } from '../../server/auth.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';
import { CoreWsMailerManagement } from '../../ws/core/management/core.ws.mailer.js';
import { CoreWsEmit } from '../../ws/core/core.ws.emit.js';
import { CoreWsMailerChannel } from '../../ws/core/channels/core.ws.mailer.js';
import validator from 'validator';

const endpoint = endpointFactory(import.meta);

const logger = loggerFactory({ url: `api-${endpoint}-service` });

const select = {
  'all-name': { _id: 1, name: 1 },
  auth: { _id: 1, username: 1, email: 1, role: 1, emailConfirmed: 1 },
};

const UserService = {
  post: async (req, res, options) => {
    let result, user, _id, save, find, login;
    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            case 'verify-email':
              {
                if (!validator.isEmail(req.body.email)) throw { message: 'invalid email' };

                const token = getToken({ email: req.body.email });
                const id = `${options.host}${options.path}`;
                const user = await UserModel.findById(req.auth.user._id);

                if (user.email !== req.body.email) {
                  req.body.emailConfirmed = false;

                  const result = await UserModel.findByIdAndUpdate(req.auth.user._id, req.body, {
                    runValidators: true,
                  });
                }

                const sendResult = await MailerProvider.send({
                  id,
                  sendOptions: {
                    to: req.body.email, // req.auth.user.email, // list of receivers
                    subject: 'Email Confirmed', // Subject line
                    text: 'Email Confirmed', // plain text body
                    html: MailerProvider.instance[id].templates['CyberiaVerifyEmail'].replace('{{TOKEN}}', token), // html body
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
        user = await UserModel.find({ email: req.body.email });
        if (user[0]) {
          login = await tokenVerify(req.body.password, user[0].password);
          find = await UserModel.find({ _id: user[0]._id.toString() }).select(select['auth']);
          user = find[0];
          if (login === true) {
            result = {
              token: getToken({ user }),
              user,
            };
          }
        }
        break;

      default:
        req.body.password = await getPasswordHash(req.body.password);
        req.body.role = 'user';
        save = await new UserModel(req.body).save();
        _id = save._id;
        find = await UserModel.find({ _id }).select(select['auth']);
        user = find[0];
        result = {
          token: getToken({ user }),
          user,
        };
        break;
    }
    return result;
  },
  get: async (req, res, options) => {
    let result = {};
    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            default:
              {
                result = await jwtVerify(req.params.id);
                const [user] = await UserModel.find({ email: result.email });

                if (user) {
                  user.emailConfirmed = true;
                  result = await UserModel.findByIdAndUpdate(user._id.toString(), user, { runValidators: true });
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
        result = await UserModel.find().select(select['all-name']);
        // User.findById(id).select("_id, isActive").then(...)
        break;

      case 'auth':
        result = await UserModel.find({ _id: req.auth.user._id }).select(select['auth']);
        break;

      default:
        result = await UserModel.find({ _id: req.params.id });
        break;
    }
    return result;
  },
  delete: async (req, res, options) => {
    let result = {};
    switch (req.params.id) {
      case 'all':
        break;

      default:
        result = await UserModel.findByIdAndDelete(req.params.id);
        break;
    }
    return result;
  },
  put: async (req, res, options) => {
    let result, find;
    switch (req.params.id) {
      default:
        if (req.body.password) req.body.password = await getPasswordHash(req.body.password);
        if (req.body.email !== req.auth.user.email) req.body.emailConfirmed = false;
        result = await UserModel.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
        find = await UserModel.find({ _id: result._id.toString() }).select(select['auth']);
        result = find[0];
        break;
    }
    return result;
  },
};

export { UserService };
