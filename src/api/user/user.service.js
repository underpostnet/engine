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

const getDefaultProfileImageId = async (File) => {
  const faId = 'user';
  const tmpFilePath = `./tmp/${faId}-${s4() + s4()}.svg`;
  fs.writeFileSync(tmpFilePath, svg(faId, '#5f5f5f'), 'utf8');
  const file = await new File(FileFactory.svg(fs.readFileSync(tmpFilePath), `${faId}.svg`)).save();
  fs.removeSync(tmpFilePath);
  return file._id;
};

const UserService = {
  post: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.File;

    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            case 'verify-email': {
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

              if (!sendResult) throw new Error('email send error');
              return { message: 'email send successfully' };
            }

            default:
          }

        default:
      }
    }
    switch (req.params.id) {
      case 'auth':
        const user = await User.findOne({
          email: req.body.email,
        });
        const { _id } = user;

        if (user) {
          const validPassword = await verifyPassword(req.body.password, user.password);
          if (validPassword === true) {
            if (!user.profileImageId)
              await User.findByIdAndUpdate(
                user._id,
                { profileImageId: await getDefaultProfileImageId(File) },
                {
                  runValidators: true,
                },
              );
            {
              const user = await User.findOne({
                _id,
              }).select(select['auth']);
              return {
                token: hashJWT({ user }),
                user,
              };
            }
          } else throw new Error('invalid email or password');
        } else throw new Error('invalid email or password');

      default: {
        req.body.password = await hashPassword(req.body.password);
        req.body.role = 'user';
        req.body.profileImageId = await getDefaultProfileImageId(File);
        const { _id } = await new User(req.body).save();
        if (_id) {
          const user = await User.find({ _id }).select(select['auth']);
          return {
            token: hashJWT({ user }),
            user,
          };
        } else throw new Error('failed to create user');
      }
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    if (options.uri) {
      switch (options.uri) {
        case '/mailer':
          switch (req.params.id) {
            default: {
              const payload = verifyJWT(req.params.id);
              const user = await User.findOne({
                email: payload.email,
              });
              if (user) {
                const { _id } = user;
                {
                  const user = await User.findByIdAndUpdate(_id, { emailConfirmed: true }, { runValidators: true });
                }
                const userWsId = CoreWsMailerManagement.getUserWsId(
                  `${options.host}${options.path}`,
                  user._id.toString(),
                );
                CoreWsEmit(CoreWsMailerChannel.channel, CoreWsMailerChannel.client[userWsId], {
                  status: 'email-confirmed',
                  id: userWsId,
                });
                return { message: 'email confirmed' };
              } else new Error('invalid token');
            }
          }

        default:
      }
    }
    switch (req.params.id) {
      case 'all':
        return await User.find().select(select['all-name']);

      case 'auth':
        return await User.find({
          _id: req.auth.user._id,
        }).select(select['auth']);

      default:
        return await User.find({
          _id: req.params.id,
        });
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    switch (req.params.id) {
      default:
        return await User.findByIdAndDelete(req.params.id);
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.User;

    switch (req.params.id) {
      default: {
        delete req.body.password;
        if (req.body.email !== req.auth.user.email) req.body.emailConfirmed = false;
        const { _id } = await User.findByIdAndUpdate(req.params.id, req.body, { runValidators: true });
        return await User.findOne({
          _id,
        }).select(select['auth']);
      }
    }
  },
};

export { UserService };
