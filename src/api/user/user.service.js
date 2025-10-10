import { loggerFactory } from '../../server/logger.js';
import {
  hashPassword,
  verifyPassword,
  verifyJWT,
  createSessionAndUserToken,
  createUserAndSession,
  refreshSessionAndToken,
  logoutSession,
  jwtSign,
  getBearerToken,
  validatePasswordMiddleware,
} from '../../server/auth.js';
import { MailerProvider } from '../../mailer/MailerProvider.js';
import { CoreWsMailerManagement } from '../../ws/core/management/core.ws.mailer.js';
import { CoreWsEmit } from '../../ws/core/core.ws.emit.js';
import { CoreWsMailerChannel } from '../../ws/core/channels/core.ws.mailer.js';
import validator from 'validator';
import { DataBaseProvider } from '../../db/DataBaseProvider.js';
import { FileFactory } from '../file/file.service.js';
import { UserDto } from './user.model.js';
import { selectDtoFactory, ValkeyAPI } from '../../server/valkey.js';

const logger = loggerFactory(import.meta);

const UserService = {
  post: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    if (req.params.id === 'recover-verify-email') {
      const user = await User.findOne({
        email: req.body.email,
      });

      if (!user) throw new Error('Email address does not exist');

      const token = jwtSign({ email: req.body.email }, options, 15);
      const payloadToken = jwtSign({ email: req.body.email }, options, 15);
      const id = `${options.host}${options.path}`;
      const translate = MailerProvider.instance[id].translateTemplates.recoverEmail;
      const recoverUrl = `${process.env.NODE_ENV === 'development' ? 'http://' : 'https://'}${req.body.hostname}${
        req.body.proxyPath
      }recover?payload=${payloadToken}`;
      const sendResult = await MailerProvider.send({
        id,
        sendOptions: {
          to: req.body.email, // list of receivers
          subject: translate.H1[req.lang], // Subject line
          text: translate.H1[req.lang], // plain text body
          html: MailerProvider.instance[id].templates.userRecoverEmail
            .replace('{{H1}}', translate.H1[req.lang])
            .replace('{{P1}}', translate.P1[req.lang])
            .replace('{{TOKEN}}', token)
            .replace(`{{COMPANY}}`, req.body.hostname) // html body
            .replace('{{RECOVER_WEB_URL}}', recoverUrl)
            .replace('{{RECOVER_BTN_LABEL}}', translate.BTN_LABEL[req.lang]),

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

    if (req.path.startsWith('/mailer') && req.params.id === 'verify-email') {
      if (!validator.isEmail(req.body.email)) throw { message: 'invalid email' };

      const token = jwtSign({ email: req.body.email }, options, 15);
      const id = `${options.host}${options.path}`;
      const user = await User.findById(req.auth.user._id);

      if (user.emailConfirmed) throw new Error('email already confirmed');

      if (user.email !== req.body.email) {
        req.body.emailConfirmed = false;

        const result = await User.findByIdAndUpdate(
          req.auth.user._id,
          { emailConfirmed: false, email: req.body.email },
          {
            runValidators: true,
          },
        );
      }
      const translate = MailerProvider.instance[id].translateTemplates.confirmEmail;
      const sendResult = await MailerProvider.send({
        id,
        sendOptions: {
          to: req.body.email, // list of receivers
          subject: translate.H1[req.lang], // Subject line
          text: translate.H1[req.lang], // plain text body
          html: MailerProvider.instance[id].templates.userVerifyEmail
            .replace('{{H1}}', translate.H1[req.lang])
            .replace('{{P1}}', translate.P1[req.lang])
            .replace('{{TOKEN}}', token)
            .replace(`{{COMPANY}}`, req.body.hostname), // html body
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

    switch (req.params.id) {
      case 'auth':
        const user = await User.findOne({
          email: req.body.email,
        });
        const getMinutesRemaining = () => (-1 * user.failedLoginAttempts - new Date().getTime()) / (1000 * 60);
        const accountLocketMessage = () =>
          `Account locked. Please try again in: ${
            getMinutesRemaining() < 1
              ? `${(getMinutesRemaining() * 60).toFixed(0)} s`
              : `${getMinutesRemaining().toFixed(0)} min`
          }.`;

        if (user) {
          const { _id } = user;
          const validPassword = await verifyPassword(req.body.password, user.password);
          if (validPassword === true) {
            if (!user.profileImageId)
              await User.findByIdAndUpdate(
                user._id,
                { profileImageId: await options.getDefaultProfileImageId(File) },
                {
                  runValidators: true,
                },
              );
            {
              if (getMinutesRemaining() <= 0 || user.failedLoginAttempts >= 0) {
                const user = await User.findOne({
                  _id,
                }).select(UserDto.select.get());
                await User.findByIdAndUpdate(
                  _id,
                  { lastLoginDate: new Date(), failedLoginAttempts: 0 },
                  {
                    runValidators: true,
                  },
                );

                const { jwtid } = await createSessionAndUserToken(user, User, req, res, options);
                return {
                  token: jwtSign(
                    UserDto.auth.payload(user, jwtid, req.ip, req.headers['user-agent'], options.host, options.path),
                    options,
                  ),
                  user,
                };
              } else throw new Error(accountLocketMessage());
            }
          } else {
            if (user.failedLoginAttempts >= 5) {
              await User.findByIdAndUpdate(
                _id,
                { failedLoginAttempts: -1 * (+new Date() + 60 * 1000 * 15) },
                {
                  runValidators: true,
                },
              );
              setTimeout(async () => {
                await User.findByIdAndUpdate(
                  _id,
                  { failedLoginAttempts: 0 },
                  {
                    runValidators: true,
                  },
                );
              }, 60 * 1000 * 15);
              throw new Error(`Account locked. Please try again in: 15 min.`);
            } else if (user.failedLoginAttempts < 0 && getMinutesRemaining() > 0) {
              throw new Error(accountLocketMessage());
            } else if (user.failedLoginAttempts < 0 && getMinutesRemaining() < 0) {
              await User.findByIdAndUpdate(
                _id,
                { failedLoginAttempts: 0 },
                {
                  runValidators: true,
                },
              );
              user.failedLoginAttempts = 0;
            }
            try {
              await User.findByIdAndUpdate(
                _id,
                { failedLoginAttempts: user.failedLoginAttempts + 1 },
                {
                  runValidators: true,
                },
              );
            } catch (error) {
              logger.error(error, { params: req.params, body: req.body });
            }
            throw new Error(`Invalid credentials. Remaining attempts: ${5 - user.failedLoginAttempts}`);
          }
        } else throw new Error('Invalid credentials');

      case 'guest': {
        const user = await ValkeyAPI.valkeyObjectFactory(options, 'user');
        await ValkeyAPI.setValkeyObject(options, user.email, user);
        return {
          token: jwtSign(
            UserDto.auth.payload(user, null, req.ip, req.headers['user-agent'], options.host, options.path),
            options,
          ),
          user: selectDtoFactory(user, UserDto.select.get()),
        };
      }

      default: {
        return await createUserAndSession(req, res, User, File, options);
      }
    }
  },
  get: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    if (req.path.startsWith('/email')) {
      return await User.findOne({
        email: req.params.email,
      }).select(UserDto.select.get());
    }

    if (req.path.startsWith('/recover')) {
      let payload;
      try {
        payload = verifyJWT(req.params.id, options);
      } catch (error) {
        logger.error(error, { 'req.params.id': req.params.id });
        options.png.header(res);
        return options.png.buffer['invalid-token'];
      }
      const user = await User.findOne({
        email: payload.email,
      });
      if (user) {
        const { _id } = user;
        await User.findByIdAndUpdate(
          _id,
          { recoverTimeOut: new Date(+new Date() + 1000 * 60 * 15) },
          { runValidators: true },
        );
        options.png.header(res);
        return options.png.buffer['recover'];
      } else {
        options.png.header(res);
        return options.png.buffer['invalid-token'];
      }
    }

    if (req.path.startsWith('/mailer')) {
      let payload;
      try {
        payload = verifyJWT(req.params.id, options);
      } catch (error) {
        logger.error(error, { 'req.params.id': req.params.id });
        options.png.header(res);
        return options.png.buffer['invalid-token'];
      }
      const user = await User.findOne({
        email: payload.email,
      });
      if (user) {
        const { _id } = user;
        {
          const user = await User.findByIdAndUpdate(_id, { emailConfirmed: true }, { runValidators: true });
        }
        const userWsId = CoreWsMailerManagement.getUserWsId(`${options.host}${options.path}`, user._id.toString());
        CoreWsEmit(CoreWsMailerChannel.channel, CoreWsMailerChannel.client[userWsId], {
          status: 'email-confirmed',
          id: userWsId,
        });
        options.png.header(res);
        return options.png.buffer['check'];
      } else {
        options.png.header(res);
        return options.png.buffer['invalid-token'];
      }
    }

    switch (req.params.id) {
      case 'all': {
        if (req.auth.user.role === 'admin') {
          const page = parseInt(req.query.page) || 1;
          const limit = parseInt(req.query.limit) || 10;
          const skip = (page - 1) * limit;

          const data = await User.find().select(UserDto.select.get()).skip(skip).limit(limit);
          const total = await User.countDocuments();

          return {
            data,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          };
        } else throw new Error(`Invalid token user id`);
      }

      case 'auth': {
        let user;
        if (req.auth.user._id.match('guest')) {
          user = await ValkeyAPI.getValkeyObject(options, req.auth.user.email);
          if (!user) throw new Error('guest user expired');
        } else
          user = await User.findOne({
            _id: req.auth.user._id,
          });

        if (!user) throw new Error('user not found');

        const file = await File.findOne({ _id: user.profileImageId });

        if (!file && !(await ValkeyAPI.getValkeyObject(options, req.auth.user.email))) {
          await User.findByIdAndUpdate(
            user._id,
            { profileImageId: await options.getDefaultProfileImageId(File) },
            {
              runValidators: true,
            },
          );
        }

        const guestUser = await ValkeyAPI.getValkeyObject(options, req.auth.user.email);
        if (guestUser)
          return {
            user: selectDtoFactory(guestUser, UserDto.select.get()),
            token: getBearerToken(req),
          };

        return {
          token: await refreshSessionAndToken(req, res, User, options),
          user: await User.findOne({
            _id: req.auth.user._id,
          }).select(UserDto.select.get()),
        };
      }

      default: {
        const user = await User.findOne({
          _id: req.auth.user._id,
        });
        switch (user.role) {
          case 'admin': {
            if (req.params.id) return await User.findById(req.params.id);
            return await User.find();
          }
          default:
            if (req.auth.user._id !== req.params.id) throw new Error(`Invalid token user id`);
            return await User.findOne({
              _id: req.params.id,
            }).select(UserDto.select.get());
        }
      }
    }
  },
  delete: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    if (req.params.id === 'logout') {
      const result = await logoutSession(User, req, res);
      if (!result) throw new Error('Logout failed');
      return { message: 'Logged out successfully' };
    }

    switch (req.params.id) {
      default: {
        const user = await User.findOne({
          _id: req.auth.user._id,
        });
        switch (user.role) {
          case 'admin': {
            if (req.params.id) return await User.findByIdAndDelete(req.params.id);
            else return await User.deleteMany();
          }
          default:
            if (req.auth.user._id !== req.params.id) throw new Error(`Invalid token user id`);
            const user = await User.findOne({
              _id: req.params.id,
            }).select(UserDto.select.get());
            if (user) {
              await User.findByIdAndDelete(req.params.id);
              return user;
            } else throw new Error('user not found');
        }
      }
    }
  },
  put: async (req, res, options) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.User;

    /** @type {import('../file/file.model.js').FileModel} */
    const File = DataBaseProvider.instance[`${options.host}${options.path}`].mongoose.models.File;

    // req.path | req.baseUrl

    if (req.path.startsWith('/profile-image')) {
      const _id = req.auth.user._id;
      if (_id !== req.params.id) throw new Error(`Invalid token user id`);
      const user = await User.findOne({
        _id,
      });
      if (!user) throw new Error(`User not found`);
      if (user.profileImageId) await File.findByIdAndDelete(user.profileImageId);
      const [imageFile] = await FileFactory.upload(req, File);
      if (!imageFile) throw new Error('invalid file');
      await User.findByIdAndUpdate(
        _id,
        {
          profileImageId: imageFile._id.toString(),
        },
        { runValidators: true },
      );
      return await User.findOne({
        _id,
      }).select(UserDto.select.get());
    }

    if (req.path.startsWith('/recover')) {
      const payload = verifyJWT(req.params.id, options);
      const user = await User.findOne({
        email: payload.email,
      });
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Only production check image token request on mailer GET /user/recover, set fallback timeout');
        user.recoverTimeOut = new Date(+new Date() + 1000 * 60 * 15);
      }
      if (user && new Date().getTime() < new Date(user.recoverTimeOut).getTime()) {
        const validatePassword = validatePasswordMiddleware(req.body.password);
        if (validatePassword.status === 'error') throw new Error(validatePassword.message);
        await User.findByIdAndUpdate(
          user._id,
          { password: await hashPassword(req.body.password), recoverTimeOut: new Date(), failedLoginAttempts: 0 },
          { runValidators: true },
        );
        return await User.findOne({
          _id: user._id,
        }).select(UserDto.select.get());
      } else throw new Error('invalid token');
    } else delete req.body.password;

    switch (req.params.id) {
      default: {
        const user = await User.findOne({
          _id: req.auth.user._id,
        });
        switch (user.role) {
          case 'admin': {
            return await User.findByIdAndUpdate(req.params.id, req.body, {
              runValidators: true,
            });
          }
          default: {
            const _id = req.auth.user._id;
            if (_id !== req.params.id) throw new Error(`Invalid token user id`);
            const user = await User.findOne({ _id });
            await User.findByIdAndUpdate(
              _id,
              {
                email: req.body.email && !user.emailConfirmed ? req.body.email : user.email,
                username: req.body.username,
              },
              { runValidators: true },
            );
            return await User.findOne({
              _id,
            }).select(UserDto.select.get());
          }
        }
      }
    }
  },
};

export { UserService };
