/**
 * @module src/api/types
 * @description The contract between the Express runtime and the API modules of `src/api/<api>/`.
 *
 * The runtime owns the Express application. For each host path it builds one {@link ApiRouterContext}
 * per API, starts the module and mounts the router the module returns.
 */

/**
 * The host path an API instance serves.
 * @typedef {Object} ApiRuntimeIdentity
 * @property {string} host - Such as `www.nexodev.org`.
 * @property {string} path - Such as `/` or `/cyberia`.
 * @property {string} apiBasePath - The path of the API contract below the host path, such as `/api/v1`.
 */

/**
 * The principal of an authenticated request.
 * @typedef {Object} ApiAuthPrincipal
 * @property {string} _id - A user id, a guest id, or `service:<origin>` for a cross-domain service.
 * @property {'admin'|'moderator'|'user'|'guest'} role
 * @property {string} host - The host the session belongs to.
 * @property {string} path - The path the session belongs to.
 * @property {string} [username]
 * @property {string} [email]
 * @property {string} [jwtid] - The session id of a user token.
 * @property {boolean} [service] - True for a request signed with the cross-domain service key.
 */

/**
 * An Express request with the properties the runtime adds.
 * @typedef {import('express').Request & {
 *   auth?: {user: ApiAuthPrincipal},
 *   lang: 'en'|'es',
 *   rawBody?: Buffer,
 *   files?: Object<string, import('express-fileupload').UploadedFile|import('express-fileupload').UploadedFile[]>,
 * }} ApiRequest
 */

/**
 * @typedef {(req: ApiRequest, res: import('express').Response, next: import('express').NextFunction) => unknown} ApiMiddleware
 */

/**
 * A controller or service handler. It answers the value the success envelope carries.
 * @typedef {(req: ApiRequest, res: import('express').Response, context: ApiRouterContext) => Promise<unknown>} ApiHandler
 */

/**
 * Model access scoped to the host path.
 * @typedef {Object} ApiDatabaseService
 * @property {(name: string) => import('mongoose').Model<unknown>} getModel - A model by API or model name.
 * @property {() => import('mongoose').Connection} getConnection
 * @property {() => {provider: string, host: string, name: string, partitions: Object<string, {name: string, apis: string[]}>}} configuration -
 *   The database configuration of the host path, without credentials.
 */

/**
 * Authentication and role checks of the host path (`src/server/security/auth.js`). Each `require*`
 * chain authenticates first.
 * @typedef {Object} ApiAuthService
 * @property {ApiMiddleware} authenticate - Sets `req.auth` from the bearer token, or answers 401.
 * @property {ApiMiddleware[]} requireUser - Any signed-in role but guest.
 * @property {ApiMiddleware[]} requireModerator - A moderator or an admin.
 * @property {ApiMiddleware[]} requireAdmin - An admin.
 */

/**
 * Mail delivery of the host path, with its templates.
 * @typedef {Object} ApiMailerService
 * @property {(sendOptions: import('nodemailer').SendMailOptions) => Promise<unknown>} send - Answers
 *   the delivery result, or `undefined` when the delivery failed.
 * @property {(name: string) => string} template - An HTML template, such as `userVerifyEmail`.
 * @property {(name: string) => Object<string, Object<string, string>>} translation - The texts of a
 *   template by key and language.
 */

/**
 * A static asset of an API, read once per process.
 * @typedef {Object} ApiAsset
 * @property {Buffer} buffer
 * @property {string} contentType
 * @property {string} etag
 * @property {string} cacheControl
 */

/**
 * A static asset an API module declares.
 * @typedef {Object} ApiAssetDeclaration
 * @property {URL|string} file - An absolute path or a `file:` URL.
 * @property {string} contentType
 */

/**
 * The declared assets of one API.
 * @typedef {Object} ApiAssetService
 * @property {(name: string) => ApiAsset} get - Throws a 404 error for a name the module does not declare.
 */

/**
 * The shared services a module receives: only those it declares.
 * @typedef {Object} ApiServices
 * @property {ApiDatabaseService} [database]
 * @property {ApiAuthService} [auth]
 * @property {ApiMailerService} [mailer]
 * @property {ApiAssetService} [assets]
 */

/**
 * The name of one shared service.
 * @typedef {'database'|'auth'|'mailer'|'assets'} ApiServiceName
 */

/**
 * The contribution of a project to an API of one host: `src/projects/<project>/<api>.extension.js`,
 * named by `apiExtensions` in `conf.server.json`. The API calls `mount` at its own extension point,
 * so its routes keep their order.
 * @typedef {Object} ApiExtension
 * @property {string} api - The API it extends.
 * @property {(router: import('express').Router, context: ApiRouterContext) => void} mount - Adds its routes.
 * @property {(key: string, context: ApiRouterContext) => Promise<string|null>} [resolveKey] - Resolves a
 *   key the API does not know.
 * @property {(query: Record<string, unknown>, context: ApiRouterContext) => Promise<Record<string, unknown>>} [listParams] -
 *   Rewrites the query of a list.
 * @property {(doc: Record<string, unknown>, context: ApiRouterContext, scope?: {assets?: boolean}) => Promise<void>} [beforeDelete] -
 *   Runs before the API deletes a document; `scope.assets` also removes its client assets.
 */

/**
 * What an API module receives for one host path: its runtime identity, its configuration, the
 * services it declares and the host's extension of it. The runtime freezes it. `consumes` maps
 * each API this host serves for another domain to that domain; `origins` are the origins the host
 * allows; `publicHosts` are the hosts whose path routes reach the host path. Services and the
 * platform address host-scoped state by the identity fields, so they are fields of the context itself.
 * @typedef {ApiRuntimeIdentity & {
 *   consumes: Readonly<Record<string, string>>,
 *   origins: ReadonlyArray<string>,
 *   publicHosts: ReadonlyArray<string>,
 *   services: Readonly<ApiServices>,
 *   extension?: ApiExtension,
 * }} ApiRouterContext
 */

/**
 * The export `ApiModule` of every `src/api/<api>/<api>.router.js`.
 * @typedef {Object} ApiModuleDefinition
 * @property {string} id - The API name: the folder name.
 * @property {ApiServiceName[]} services - The shared services the module uses.
 * @property {Object<string, ApiAssetDeclaration>} [assets] - The static assets of the module; needs `assets`.
 * @property {(context: ApiRouterContext) => Promise<void>} [initialize] - Runs once per host path,
 *   before the router mounts. A failure keeps the router unmounted.
 * @property {(context: ApiRouterContext) => import('express').Router} createRouter - Declares the routes.
 */

export {};
