/**
 * GoogleAuth service: sign-in with a Google account, by the OAuth 2.0 authorization code flow
 * with PKCE.
 *
 * Passport drives the flow. This module owns its state, the account a Google identity resolves
 * to, and the hand-off to the PWA. No URL carries a token: each flow keeps its result in
 * cookies named by the flow, and the PWA exchanges them for a session or a link.
 *
 * @module src/api/google-auth/google-auth.service.js
 * @namespace GoogleAuthService
 */
import { Types } from 'mongoose';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { DataBaseProviderService } from '../../db/DataBaseProvider.js';
import { loggerFactory } from '../../server/ops/logger.js';
import { cookieOptionsFactory, generateRandomHex, hashToken, signSessionToken } from '../../server/security/auth.js';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../../client/components/core/CommonJs.js';
import { UserDto } from '../user/user.model.js';

const logger = loggerFactory(import.meta);

/** Sign-in needs the identity only: no Google API is called on the user's behalf. */
const GOOGLE_AUTH_SCOPES = Object.freeze(['openid', 'email', 'profile']);

/** Outcomes the PWA reads from the `google-auth` query parameter of the return route. */
const GOOGLE_AUTH_STATUS = Object.freeze({
  success: 'success',
  link: 'link',
  cancelled: 'cancelled',
  conflict: 'conflict',
  unverifiedEmail: 'unverified-email',
  unavailable: 'unavailable',
  error: 'error',
});

/** PWA views a flow starts from. A flow that does not sign in returns to its view. */
const GOOGLE_AUTH_VIEWS = Object.freeze(['log-in', 'sign-up']);

const COOKIE = Object.freeze({ state: 'googleAuthState', ticket: 'googleAuthTicket', link: 'googleAuthLink' });
const FLOW_PATTERN = /^[0-9a-f]{48}$/;
const STATE_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 60 * 1000;
const LINK_TTL_MS = 10 * 60 * 1000;
/** A link needs a session this recent: the log-in that proves control of the account. */
const FRESH_SESSION_MS = 10 * 60 * 1000;
const USERNAME_ATTEMPTS = 5;

/**
 * The OAuth client of a host, or null when Google sign-in is off.
 * `GOOGLE_CALLBACK_URL` overrides the host's own callback. Google must list it exactly.
 * @param {import('../types.js').RouterOptions} options - Router options.
 * @returns {{clientID: string, clientSecret: string, callbackURL: string}|null}
 * @memberof GoogleAuthService
 */
const googleAuthConfig = (options) => {
  const { GOOGLE_CLIENT_ID: clientID, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_CALLBACK_URL } = process.env;
  if (!clientID || !clientSecret) return null;
  const callbackURL = URL.parse(
    GOOGLE_CALLBACK_URL || `https://${options.host}${options.apiPath}/google-auth/callback`,
  );
  if (!callbackURL || !['https:', 'http:'].includes(callbackURL.protocol)) return null;
  return { clientID, clientSecret, callbackURL: callbackURL.href };
};

const flowOf = (value) => (FLOW_PATTERN.test(`${value ?? ''}`) ? value : '');
const viewOf = (value) => (GOOGLE_AUTH_VIEWS.includes(value) ? value : GOOGLE_AUTH_VIEWS[0]);

/**
 * The PWA route a flow ends on: home after a sign-in, the log-in view for a link, else the view
 * the flow started from. It is relative, so it stays on the origin that served the request.
 * @param {import('../types.js').RouterOptions} options - Router options.
 * @param {string} status - One of {@link GOOGLE_AUTH_STATUS}.
 * @param {{flow?: string, view?: string}} [flowContext] - The flow, and the view it started from.
 * @returns {string}
 * @memberof GoogleAuthService
 */
const returnPath = (options, status, { flow = '', view } = {}) => {
  const exchanged = status === GOOGLE_AUTH_STATUS.success || status === GOOGLE_AUTH_STATUS.link;
  const route =
    status === GOOGLE_AUTH_STATUS.success
      ? ''
      : status === GOOGLE_AUTH_STATUS.link
        ? GOOGLE_AUTH_VIEWS[0]
        : viewOf(view);
  const query = new URLSearchParams({
    'google-auth': status,
    ...(exchanged && flow ? { 'google-auth-flow': flow } : {}),
  });
  return `${options.path.replace(/\/?$/, '/')}${route}?${query}`;
};

/**
 * Attributes of the flow's cookies: signed, HttpOnly, limited to this API. `Lax` sends them on
 * the top-level redirect back from Google.
 * @param {import('express').Request} req - Express request.
 * @param {import('../types.js').RouterOptions} options - Router options.
 * @param {number} [maxAge] - Lifetime in milliseconds.
 * @returns {object}
 */
const flowCookie = (req, options, maxAge) => ({
  ...cookieOptionsFactory(req, options.host),
  sameSite: 'Lax',
  path: `${options.apiPath}/google-auth`,
  signed: true,
  maxAge,
});

const cookieName = (kind, flow) => `${COOKIE[kind]}-${flow}`;

/** Reads a cookie of a flow and removes it, so it serves one request. */
const takeFlowCookie = (req, res, options, kind, flow) => {
  if (!flow) return null;
  res.clearCookie(cookieName(kind, flow), flowCookie(req, options));
  return req.signedCookies?.[cookieName(kind, flow)] || null;
};

/**
 * Passport state store that keeps each authorization request, with its PKCE verifier and view, in
 * a cookie named by the request. No server memory holds it, so any replica serves the callback,
 * a callback in another browser fails, and parallel requests do not overwrite one another.
 * @param {import('../types.js').RouterOptions} options - Router options.
 * @returns {{store: Function, verify: Function}}
 * @memberof GoogleAuthService
 */
const cookieStateStore = (options) => ({
  // Passport selects the PKCE form of a store by arity: store(5), verify(3).
  store(req, verifier, state, meta, done) {
    const flow = generateRandomHex(24);
    const transaction = { verifier, view: viewOf(req.query.view), expiresAt: Date.now() + STATE_TTL_MS };
    req.res.cookie(cookieName('state', flow), transaction, flowCookie(req, options, STATE_TTL_MS));
    done(null, flow);
  },
  verify(req, providedState, done) {
    const flow = flowOf(providedState);
    const transaction = flow ? req.signedCookies?.[cookieName('state', flow)] : null;
    if (!transaction || !(transaction.expiresAt > Date.now()))
      return done(null, false, { message: 'Invalid authorization request state' });
    done(null, transaction.verifier);
  },
});

/**
 * The claims of Google's userinfo response that sign-in reads. Google is the authority for a
 * verified Gmail address, and for a verified address of the Workspace domain it asserts (`hd`).
 * @param {object} profile - Passport profile.
 * @returns {{subject: string, email: string, emailVerified: boolean, authoritative: boolean, name: string}}
 * @memberof GoogleAuthService
 */
const googleClaims = (profile) => {
  const email = `${profile?.emails?.[0]?.value ?? ''}`.trim().toLowerCase();
  const emailVerified = profile?.emails?.[0]?.verified === true;
  const hostedDomain = `${profile?._json?.hd ?? ''}`.toLowerCase();
  return {
    subject: `${profile?.id ?? ''}`,
    email,
    emailVerified,
    authoritative:
      emailVerified && (email.endsWith('@gmail.com') || (!!hostedDomain && email.endsWith(`@${hostedDomain}`))),
    name: `${profile?.name?.givenName || profile?.displayName || ''}`,
  };
};

/**
 * Usernames to try for a new account: one from the Google name, then the same with a random suffix.
 * @param {string} name - Google given name or display name.
 * @returns {string[]}
 * @memberof GoogleAuthService
 */
const usernameCandidates = (name) => {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase()
    .slice(0, USERNAME_MAX_LENGTH - 5)
    .replace(/^-+|-+$/g, '');
  const stem = base.length >= USERNAME_MIN_LENGTH ? base : 'user';
  return [stem, ...Array.from({ length: USERNAME_ATTEMPTS - 1 }, () => `${stem}-${generateRandomHex(2)}`)];
};

const isDuplicateKey = (error) => error?.code === 11000;

const failure = (message, status) => Object.assign(new Error(message), { status });

const modelsOf = (options) => ({
  GoogleAuth: DataBaseProviderService.getModel('GoogleAuth', options),
  User: DataBaseProviderService.getModel('User', options),
});

/** The record of a subject whose user exists. A record whose user was deleted is removed. */
const liveIdentity = async ({ GoogleAuth, User }, subject) => {
  const identity = await GoogleAuth.findOne({ subject });
  if (!identity || (await User.exists({ _id: identity.userId }))) return identity;
  await GoogleAuth.deleteOne({ _id: identity._id, userId: identity.userId });
  return null;
};

/**
 * Creates the user of a new Google account. The record is written first and names the user id,
 * so concurrent first sign-ins of one subject make one user. A failed creation removes the record.
 */
const provision = async ({ GoogleAuth, User }, claims) => {
  const { subject, email, emailVerified, authoritative, name } = claims;
  const identity = await GoogleAuth.create({ subject, userId: new Types.ObjectId(), email, emailVerified }).catch(
    async (error) => {
      if (!isDuplicateKey(error)) throw error;
      return await GoogleAuth.findOne({ subject });
    },
  );
  if (!identity) return { status: GOOGLE_AUTH_STATUS.error };
  const release = () => GoogleAuth.deleteOne({ _id: identity._id, userId: identity.userId });

  for (const username of usernameCandidates(name)) {
    try {
      await User.create({ _id: identity.userId, username, email, emailConfirmed: authoritative, role: 'user' });
      logger.info('Google sign-in created a user', { userId: `${identity.userId}` });
      return { identity };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      if (await User.exists({ _id: identity.userId })) return { identity };
      if (error.keyPattern?.email) {
        await release();
        return { link: claims };
      }
    }
  }
  await release();
  throw new Error('No free username for a new Google account');
};

class GoogleAuthService {
  /**
   * The Google strategy of a host. The verify step keeps no Google token.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @param {{clientID: string, clientSecret: string, callbackURL: string}} config - OAuth client.
   * @returns {GoogleStrategy}
   */
  static strategy(options, config) {
    return new GoogleStrategy(
      { ...config, pkce: true, store: cookieStateStore(options) },
      (accessToken, refreshToken, profile, done) =>
        GoogleAuthService.resolve(profile, options).then(
          ({ identity, link, status }) => done(null, identity ?? false, { link, status }),
          done,
        ),
    );
  }

  /**
   * Resolves a Google profile to the account it signs in as.
   *
   * - A linked subject signs in as its user, whatever its email is now.
   * - A new subject whose email Google is the authority for, matching one confirmed account
   *   without a Google link, links to that account.
   * - A new subject whose email an account holds otherwise must prove that account: `link`.
   * - A new subject with a verified email no account holds gets a new user.
   * @param {object} profile - Passport profile.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{identity?: object, link?: object, status?: string}>} The record, the
   *   claims to link after a log-in, or the reason there is neither.
   */
  static async resolve(profile, options) {
    const claims = googleClaims(profile);
    if (!claims.subject || !claims.email) return { status: GOOGLE_AUTH_STATUS.error };
    const models = modelsOf(options);
    const { GoogleAuth, User } = models;

    const identity = await liveIdentity(models, claims.subject);
    if (identity) {
      await GoogleAuth.updateOne(
        { _id: identity._id },
        { $set: { email: claims.email, emailVerified: claims.emailVerified } },
      );
      return { identity };
    }
    if (!claims.emailVerified) return { status: GOOGLE_AUTH_STATUS.unverifiedEmail };

    const holders = await User.find({ email: claims.email }).select('emailConfirmed').limit(2);
    if (holders.length > 1) {
      logger.warn('Google sign-in found several accounts for one email and links none', {
        userIds: holders.map(({ _id }) => `${_id}`),
      });
      return { link: claims };
    }
    const [holder] = holders;
    if (!holder) return await provision(models, claims);

    // The holder is this subject's own user when a concurrent first sign-in created it.
    const own = await GoogleAuth.findOne({ subject: claims.subject, userId: holder._id });
    if (own) return { identity: own };
    if (!claims.authoritative || !holder.emailConfirmed) return { link: claims };
    return await GoogleAuthService.bind(claims, holder._id, options);
  }

  /**
   * Binds a Google subject to a user. Binding the same pair again is harmless. A subject or a
   * user that has another binding is a conflict, never a transfer.
   * @param {{subject: string, email: string, emailVerified: boolean}} claims - Google claims.
   * @param {Types.ObjectId|string} userId - The user.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{identity?: object, status?: string}>}
   */
  static async bind({ subject, email, emailVerified }, userId, options) {
    const { GoogleAuth } = modelsOf(options);
    try {
      return { identity: await GoogleAuth.create({ subject, userId, email, emailVerified }) };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const identity = await GoogleAuth.findOne({ subject, userId });
      return identity ? { identity } : { status: GOOGLE_AUTH_STATUS.conflict };
    }
  }

  /**
   * Gives the browser a one-time ticket for the session of an identity. Only its hash is stored.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @param {object} identity - GoogleAuth record.
   * @param {string} flow - The flow the ticket answers.
   * @returns {Promise<void>}
   */
  static async issueTicket(req, res, options, identity, flow) {
    const ticket = generateRandomHex(32);
    await modelsOf(options).GoogleAuth.updateOne(
      { _id: identity._id },
      { $set: { ticketHash: hashToken(ticket), ticketExpiresAt: new Date(Date.now() + TICKET_TTL_MS) } },
    );
    res.cookie(cookieName('ticket', flow), ticket, flowCookie(req, options, TICKET_TTL_MS));
  }

  /**
   * Keeps verified Google claims in the browser until a log-in proves the account to link them to.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @param {object} claims - Google claims.
   * @param {string} flow - The flow the claims come from.
   */
  static holdLink(req, res, options, { subject, email, emailVerified, authoritative }, flow) {
    const pending = { subject, email, emailVerified, authoritative, expiresAt: Date.now() + LINK_TTL_MS };
    res.cookie(cookieName('link', flow), pending, flowCookie(req, options, LINK_TTL_MS));
  }

  /**
   * Removes the authorization request cookie of a callback, so a request serves one callback.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {{flow: string, view: string}} The flow, and the view it started from.
   */
  static takeState(req, res, options) {
    const flow = flowOf(req.query.state);
    return { flow, view: viewOf(takeFlowCookie(req, res, options, 'state', flow)?.view) };
  }

  /**
   * POST `/session` `{ flow }`: exchanges the ticket of a flow for a normal session. The ticket is
   * consumed before it is checked, so it works once.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{token: string, user: object}>} The response `POST /user/auth` gives.
   * @throws {Error} `status` 401 when the ticket is missing, unknown, used or expired.
   */
  static session = async (req, res, options) => {
    const ticket = takeFlowCookie(req, res, options, 'ticket', flowOf(req.body?.flow));
    const { GoogleAuth, User } = modelsOf(options);
    const invalid = () => failure('The sign-in ticket is invalid or expired', 401);

    const identity =
      typeof ticket === 'string'
        ? await GoogleAuth.findOneAndUpdate(
            { ticketHash: hashToken(ticket) },
            { $unset: { ticketHash: 1, ticketExpiresAt: 1 } },
            { returnDocument: 'before' },
          )
        : null;
    if (!identity || !(identity.ticketExpiresAt > new Date())) throw invalid();

    const user = await User.findByIdAndUpdate(
      identity.userId,
      { lastLoginDate: new Date() },
      { returnDocument: 'after' },
    ).select(UserDto.select.get());
    if (!user) throw invalid();

    return { token: await signSessionToken(user, User, req, res, options), user };
  };

  /**
   * POST `/link` `{ flow }`: links the Google account a flow verified to the user of a recent
   * session. The session proves the account; Google proves its own account. When Google is the
   * authority for the user's email, the email becomes confirmed.
   * @param {import('express').Request} req - Express request.
   * @param {import('express').Response} res - Express response.
   * @param {import('../types.js').RouterOptions} options - Router options.
   * @returns {Promise<{user: object}>}
   * @throws {Error} `status` 401 when the link request or the session is not valid and recent,
   *   409 when the Google account or the user has another link.
   */
  static link = async (req, res, options) => {
    const claims = takeFlowCookie(req, res, options, 'link', flowOf(req.body?.flow));
    if (!claims || !(claims.expiresAt > Date.now()))
      throw failure('The Google link request is invalid or expired', 401);
    const { _id, jwtid } = req.auth.user;
    if (!Types.ObjectId.isValid(jwtid) || Date.now() - new Types.ObjectId(jwtid).getTimestamp() > FRESH_SESSION_MS)
      throw failure('Log in again to link your Google account', 401);

    const models = modelsOf(options);
    await liveIdentity(models, claims.subject);
    const { identity } = await GoogleAuthService.bind(claims, _id, options);
    if (!identity) throw failure('This Google account cannot be linked to this account', 409);

    if (claims.authoritative)
      await models.User.updateOne({ _id, email: claims.email, emailConfirmed: false }, { emailConfirmed: true });
    return { user: await models.User.findById(_id).select(UserDto.select.get()) };
  };
}

export {
  GoogleAuthService,
  GOOGLE_AUTH_SCOPES,
  GOOGLE_AUTH_STATUS,
  googleAuthConfig,
  googleClaims,
  returnPath,
  usernameCandidates,
};
