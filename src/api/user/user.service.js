/**
 * User service module for handling user account operations.
 * Provides REST API handlers for authentication, registration, profile management,
 * email verification, password recovery, and guest user lifecycle management.
 *
 * @module src/api/user/user.service.js
 * @namespace UserService
 */

import { loggerFactory } from '../../server/ops/logger.js';
import { DataQuery } from '../../server/storage/data-query.js';
import {
  hashPassword,
  verifyPassword,
  verifyJWT,
  signSessionToken,
  createUserAndSession,
  refreshSessionAndToken,
  logoutSession,
  jwtSign,
  validatePasswordMiddleware,
} from '../../server/security/auth.js';
import { CoreWsEmitter } from '../../ws/core/core.ws.emit.js';
import { CoreWsMailerChannel } from '../../ws/core/channels/core.ws.mailer.js';
import validator from 'validator';
import { FileFactory, FileCleanup } from '../file/file.service.js';
import { UserDto, uniqueConflict } from './user.model.js';
import { isValidUsername, timer } from '../../client/components/core/CommonJs.js';
import { GuestService } from './guest.service.js';
import { resolveHostKeyContext } from '../../server/runtime/conf.js';

const logger = loggerFactory(import.meta);

/** The password value of the env templates: never a credential. */
const TEMPLATE_PASSWORD = 'changethis';

/**
 * Creates the first administrator of a host path with `DEFAULT_ADMIN_PASSWORD`. Without a configured
 * password the bootstrap stays pending, so no account gets a known credential. A concurrent start
 * that creates it first wins through the unique indexes.
 * @param {import('mongoose').Model} User
 * @param {import('../types.js').ApiRouterContext} context
 * @returns {Promise<void>}
 */
const seedAdministrator = async (User, context) => {
  const where = `${context.host}${context.path}`;
  try {
    if (await User.exists({ role: 'admin' })) return;
    const password = process.env.DEFAULT_ADMIN_PASSWORD;
    if (!password || password === TEMPLATE_PASSWORD) {
      logger.warn(`Administrator bootstrap of ${where} is pending: set DEFAULT_ADMIN_PASSWORD`);
      return;
    }
    await User.create({
      username: 'admin',
      email: process.env.DEFAULT_ADMIN_EMAIL || `admin@${context.host}`,
      password: await hashPassword(password),
      role: 'admin',
      emailConfirmed: true,
    });
    logger.warn(`Administrator of ${where} created with the username admin: change its password`);
  } catch (error) {
    if (error.code === 11000 && (await User.exists({ role: 'admin' }))) return;
    logger.error(`Administrator bootstrap of ${where} is incomplete`, { error: error.message });
  }
};

/**
 * User Service for handling REST API user operations.
 * Manages authentication, registration, profile CRUD, email verification,
 * password recovery, session management, and guest user lifecycle.
 * @namespace UserService
 */
class UserService {
  /**
   * POST - Create or authenticate users.
   * Supports authentication, guest account creation, email verification,
   * and password recovery email sending.
   * @async
   * @function post
   * @memberof UserService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} context - Request context containing host and path.
   * @returns {Promise<Object>} User data with auth token, or status message.
   * @throws {Error} If authentication fails, email is invalid, or email send error.
   */
  static post = async (req, res, context) => {
    /** @type {import('../file/file.model.js').FileModel} */
    const File = context.services.database.getModel('File');
    /** @type {import('./user.model.js').UserModel} */
    const User = context.services.database.getModel('User');

    if (req.params.id === 'recover-verify-email') {
      const user = await User.findOne({
        email: req.body.email,
      });

      // Simulate success even if email doesn't exist to prevent email enumeration attacks
      if (!user) {
        await timer(3000);
        return { message: 'email send successfully' };
      }

      const token = jwtSign({ email: req.body.email }, context, 15);
      const payloadToken = jwtSign({ email: req.body.email }, context, 15);
      const { mailer } = context.services;
      const translate = mailer.translation('recoverEmail');
      const recoverUrl = `${process.env.NODE_ENV === 'development' ? 'http://' : 'https://'}${req.body.hostname}${req.body.proxyPath
        }recover?payload=${payloadToken}`;
      const sendResult = await mailer.send({
        to: req.body.email, // list of receivers
        subject: translate.H1[req.lang], // Subject line
        text: translate.H1[req.lang], // plain text body
        html: mailer
          .template('userRecoverEmail')
          .replace('{{H1}}', translate.H1[req.lang])
          .replace('{{P1}}', translate.P1[req.lang])
          .replace('{{TOKEN}}', token)
          .replace(`{{COMPANY}}`, req.body.hostname) // html body
          .replace('{{RECOVER_WEB_URL}}', recoverUrl)
          .replace('{{RECOVER_BTN_LABEL}}', translate.BTN_LABEL[req.lang]),
      });

      if (!sendResult) throw new Error('email send error');
      return { message: 'email send successfully' };
    }

    if (req.path.startsWith('/mailer') && req.params.id === 'verify-email') {
      if (!validator.isEmail(req.body.email)) throw { message: 'invalid email' };

      const token = jwtSign({ email: req.body.email }, context, 15);
      const { mailer } = context.services;
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
      const translate = mailer.translation('confirmEmail');
      const sendResult = await mailer.send({
        to: req.body.email, // list of receivers
        subject: translate.H1[req.lang], // Subject line
        text: translate.H1[req.lang], // plain text body
        html: mailer
          .template('userVerifyEmail')
          .replace('{{H1}}', translate.H1[req.lang])
          .replace('{{P1}}', translate.P1[req.lang])
          .replace('{{TOKEN}}', token)
          .replace(`{{COMPANY}}`, req.body.hostname), // html body
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
          `Account locked. Please try again in: ${getMinutesRemaining() < 1
            ? `${(getMinutesRemaining() * 60).toFixed(0)} s`
            : `${getMinutesRemaining().toFixed(0)} min`
          }.`;

        if (user) {
          const { _id } = user;
          const validPassword = await verifyPassword(req.body.password, user.password);
          if (validPassword === true) {
            {
              if (getMinutesRemaining() <= 0 || user.failedLoginAttempts >= 0) {
                const user = await User.findOne({
                  _id,
                }).select(UserDto.select.get());

                // Check if profileImageId exists, if not set to null explicitly
                if (!user.profileImageId) {
                  user.profileImageId = null;
                } else {
                  const fileExists = await File.findById(user.profileImageId);
                  if (!fileExists) {
                    await User.findByIdAndUpdate(_id, { profileImageId: null }, { runValidators: true });
                    user.profileImageId = null;
                  }
                }

                await User.findByIdAndUpdate(
                  _id,
                  { lastLoginDate: new Date(), failedLoginAttempts: 0 },
                  {
                    runValidators: true,
                  },
                );

                return { token: await signSessionToken(user, User, req, res, context), user };
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
              setTimeout(
                async () => {
                  await User.findByIdAndUpdate(
                    _id,
                    { failedLoginAttempts: 0 },
                    {
                      runValidators: true,
                    },
                  );
                },
                60 * 1000 * 15,
              );
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
        return await GuestService.create(req, context);
      }

      default:
        return await createUserAndSession(req, res, User, context);
    }
  };

  /**
   * GET - Retrieve user data.
   * Supports public profile lookup by username, asset retrieval,
   * email lookup, password recovery flow, email verification,
   * admin user listing, authentication refresh, and profile retrieval.
   * @async
   * @function get
   * @memberof UserService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} context - Request context containing host and path.
   * @returns {Promise<Object>} User data with optional session token.
   * @throws {Error} If user not found, profile is private, or token invalid.
   */
  static get = async (req, res, context) => {
    /** @type {import('../file/file.model.js').FileModel} */
    const File = context.services.database.getModel('File');
    /** @type {import('./user.model.js').UserModel} */
    const User = context.services.database.getModel('User');

    if (req.path.startsWith('/username/')) {
      const userNotFound = () => Object.assign(new Error('User not found'), { status: 404 });
      if (!isValidUsername(req.params.username)) throw userNotFound();
      const userByUsername = await User.findOne({
        username: req.params.username,
      });
      if (!userByUsername) throw userNotFound();
      if (!userByUsername.publicProfile)
        throw Object.assign(new Error('Public profile is private'), { status: 403 });

      // Then fetch complete public data by ID
      const user = await User.findOne({
        _id: userByUsername._id,
      }).select(UserDto.public.get());
      return user;
    }

    if (req.path.startsWith('/assets')) {
      return context.services.assets.get(req.params.id);
    }

    if (req.path.startsWith('/email')) {
      return await User.findOne({
        email: req.params.email,
      }).select(UserDto.select.get());
    }

    if (req.path.startsWith('/recover')) {
      let payload;
      try {
        payload = verifyJWT(req.params.id, context);
      } catch (error) {
        logger.error(error, { 'req.params.id': req.params.id });
        return context.services.assets.get('invalid-token');
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
        return context.services.assets.get('recover');
      } else {
        return context.services.assets.get('invalid-token');
      }
    }

    if (req.path.startsWith('/mailer')) {
      let payload;
      try {
        payload = verifyJWT(req.params.id, context);
      } catch (error) {
        logger.error(error, { 'req.params.id': req.params.id });
        return context.services.assets.get('invalid-token');
      }
      const user = await User.findOne({
        email: payload.email,
      });
      if (user) {
        const { _id } = user;
        {
          const user = await User.findByIdAndUpdate(_id, { emailConfirmed: true }, { runValidators: true });
        }
        const userWsId = CoreWsMailerChannel.getUserWsId(resolveHostKeyContext(context), user._id.toString());
        if (userWsId && CoreWsMailerChannel.client[userWsId]) {
          CoreWsEmitter.emit(CoreWsMailerChannel.channel, CoreWsMailerChannel.client[userWsId], {
            status: 'email-confirmed',
            id: userWsId,
          });
        }
        return context.services.assets.get('check');
      } else {
        return context.services.assets.get('invalid-token');
      }
    }

    switch (req.params.id) {
      case 'all': {
        if (req.auth.user.role === 'admin') {
          // Use DataQuery.parse for filtering, sorting, and pagination
          const { query, sort, skip, limit, page } = DataQuery.parse(req.query);

          // Apply default sort if no sort was specified
          const finalSort = Object.keys(sort).length > 0 ? sort : { updatedAt: -1 };

          const [data, total] = await Promise.all([
            User.find(query).select(UserDto.select.get()).sort(finalSort).skip(skip).limit(limit),
            User.countDocuments(query),
          ]);

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
          return await GuestService.auth(req, context);
        } else
          user = await User.findOne({
            _id: req.auth.user._id,
          });

        if (!user) throw new Error('user not found');

        return {
          token: await refreshSessionAndToken(req, res, User, context),
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
  };

  /**
   * DELETE - Remove user accounts or log out sessions.
   * Supports admin bulk deletion, user self-deletion, and session logout.
   * @async
   * @function delete
   * @memberof UserService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} context - Request context containing host and path.
   * @returns {Promise<Object>} Deleted user data or logout status message.
   * @throws {Error} If logout fails, user not found, or token invalid.
   */
  static delete = async (req, res, context) => {
    /** @type {import('./user.model.js').UserModel} */
    const User = context.services.database.getModel('User');

    if (req.params.id === 'logout') {
      const result = await logoutSession(User, req, res, context);
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
  };

  /**
   * PUT - Update user data.
   * Supports profile image upload, password recovery, and profile field updates.
   * @async
   * @function put
   * @memberof UserService
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Object} context - Request context containing host and path.
   * @returns {Promise<Object>} Updated user data.
   * @throws {Error} If user not found, token invalid, or invalid file.
   */
  static put = async (req, res, context) => {
    /** @type {import('../file/file.model.js').FileModel} */
    const File = context.services.database.getModel('File');
    /** @type {import('./user.model.js').UserModel} */
    const User = context.services.database.getModel('User');

    // req.path | req.baseUrl

    if (req.path.startsWith('/profile-image')) {
      const _id = req.auth.user._id;
      if (_id !== req.params.id) throw new Error(`Invalid token user id`);
      const user = await User.findOne({
        _id,
      });
      if (!user) throw new Error(`User not found`);

      const [imageFile] = await FileFactory.upload(req, File);

      // Clean up old profile image if being replaced
      if (user.profileImageId && imageFile) {
        await FileCleanup.cleanupReplacedFiles({
          oldDoc: user,
          newData: { profileImageId: imageFile._id.toString() },
          fileFields: ['profileImageId'],
          File,
        });
      }
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
      const payload = verifyJWT(req.params.id, context);
      const user = await User.findOne({
        email: payload.email,
      });
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Only production check image token request on mailer GET /user/recover, set fallback timeout');
        user.recoverTimeOut = new Date(+new Date() + 1000 * 60 * 15);
      }
      if (user && new Date().getTime() < new Date(user.recoverTimeOut).getTime()) {
        const validatePassword = validatePasswordMiddleware(req);
        if (validatePassword.status === 'error') throw new Error(validatePassword.message);
        // A new password ends every session of the account.
        await User.findByIdAndUpdate(
          user._id,
          {
            password: await hashPassword(req.body.password),
            recoverTimeOut: new Date(),
            failedLoginAttempts: 0,
            activeSessions: [],
          },
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
            }).catch((error) => {
              throw uniqueConflict(error);
            });
          }
          default: {
            const _id = req.auth.user._id;
            if (_id !== req.params.id) throw new Error(`Invalid token user id`);
            const user = await User.findOne({ _id });
            const updateData = {
              email: req.body.email && !user.emailConfirmed ? req.body.email : user.email,
              username: req.body.username,
            };
            if (req.body.publicProfile !== undefined) updateData.publicProfile = req.body.publicProfile;
            if (req.body.briefDescription !== undefined) updateData.briefDescription = req.body.briefDescription;
            await User.findByIdAndUpdate(_id, updateData, { runValidators: true }).catch((error) => {
              throw uniqueConflict(error);
            });
            return await User.findOne({
              _id,
            }).select(UserDto.select.get());
          }
        }
      }
    }
  };

  /**
   * Prepares the user API of a host path before it takes requests: builds the unique email and
   * username indexes, then seeds the first administrator. Safe to run again, and on several
   * instances at once.
   * @async
   * @function bootstrap
   * @memberof UserService
   * @param {import('../types.js').ApiRouterContext} context - The context of the user API.
   * @returns {Promise<void>}
   * @throws {Error} When the unique indexes cannot be built.
   */
  static bootstrap = async (context) => {
    const User = context.services.database.getModel('User');
    try {
      await User.createIndexes();
    } catch (error) {
      if (error.code !== 11000) throw error;
      throw new Error(
        `The unique user indexes cannot be built: ${JSON.stringify(error.keyValue ?? {})} repeats. ` +
          'Merge or remove the duplicate accounts, then start the API again',
      );
    }
    await seedAdministrator(User, context);
  };
}

export { UserService };