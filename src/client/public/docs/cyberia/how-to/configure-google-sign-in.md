# Configure Google Sign-In

How an operator turns on "Continue with Google" for the Cyberia Online portal, in production and
on a development machine. The `google-auth` API runs the OAuth 2.0 flow on the server. The portal
gets a normal Cyberia session, as a password log-in gives.

---

## Before you start

- The Google Cloud project `cyberia-online-auth` has an OAuth client of type **Web application**.
- The deploy environment files hold the client credentials. Never put them in source, a client
  bundle or a log.

## Configuration

| Variable               | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`     | The OAuth client ID                                                                  |
| `GOOGLE_CLIENT_SECRET` | The OAuth client secret. It stays on the server                                      |
| `GOOGLE_CALLBACK_URL`  | Optional. The redirect URI. Default: `https://<host><api path>/google-auth/callback` |

Set them in `engine-private/conf/dd-cyberia/.env.<env>`. The deploy Secret carries them to the pods.

The deploy configuration also names the API and its client parts:

| File               | Entry                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `conf.server.json` | `google-auth` in `apis` of `www.cyberiaonline.com`                                          |
| `conf.client.json` | `GoogleSignIn` in the `core` components and `google-auth` in `services` of `cyberia-portal` |

Without a client ID, a secret or a valid callback, the API logs a warning at start. The button then
returns the player to the portal with the "not available" message.

## Production

The default callback of `www.cyberiaonline.com` is
`https://www.cyberiaonline.com/api/v1/google-auth/callback`. The OAuth client lists this URI, so
production needs no `GOOGLE_CALLBACK_URL`. Apply the environment and restart the deploy.

## Development

The development engine serves the portal on `http://localhost:4008`.

1. In the Google Cloud console, add `http://localhost:4008/api/v1/google-auth/callback` to the
   **Authorized redirect URIs** of the OAuth client.
2. In `.env.development`, set `GOOGLE_CALLBACK_URL=http://localhost:4008/api/v1/google-auth/callback`.
3. Restart the development engine.

Without these steps, Google sends the browser to the production callback, and sign-in fails there.

## The flow

1. `GET /api/v1/google-auth?view=log-in` (or `sign-up`) sends the browser to Google with the
   `openid`, `email` and `profile` scopes. A signed, HttpOnly cookie named by the flow holds the
   request state, the PKCE verifier and the view for 10 minutes. Parallel flows in other tabs keep
   their own cookies.
2. Google returns to `GET /api/v1/google-auth/callback`. The server checks the state against the
   cookie, exchanges the code with the verifier and reads the profile. It keeps no Google token.
3. The server resolves the account (see [Accounts](#accounts)):
   - It signs in: a one-time ticket goes into an HttpOnly cookie for 60 seconds, and the browser
     returns to `/?google-auth=success&google-auth-flow=<flow>`.
   - It needs a log-in: the verified claims go into an HttpOnly cookie for 10 minutes, and the
     browser returns to `/log-in?google-auth=link&google-auth-flow=<flow>`.
   - Otherwise the browser returns to the view it came from with the outcome.
4. The portal removes the parameters from the URL.
   - After `success` it calls `POST /api/v1/google-auth/session` with the flow. The server consumes
     the ticket and answers `{ token, user }`, as `POST /user/auth` does. `Auth.sessionIn` opens
     the session.
   - After `link` it waits for the player to log in with the password, then calls
     `POST /api/v1/google-auth/link` with the flow and the new session.

## Accounts

The Cyberia `User` record is the player. `User._id` never changes; every method signs in as it.

| Situation                                                                                 | Result                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------- |
| The Google account (`sub`) is linked                                                      | Sign-in as the linked user         |
| New Google account; Google is the authority for its email; one confirmed account holds it | The Google account links; sign-in  |
| New Google account; an account holds its email in any other state                         | `link`: log in once, then it links |
| New Google account; no account holds its verified email                                   | A new user; sign-in                |
| The matching account already has another Google account                                   | `conflict`                         |

- Google is the authority for a verified `@gmail.com` address, and for a verified address of the
  Workspace domain that Google asserts in `hd`. For any other address, `email_verified` does not
  prove control of the mailbox.
- A link needs a session opened in the last 10 minutes: the log-in proves the account, Google
  proves the Google account. When Google is the authority for the email, the email becomes
  confirmed.
- A link never moves a Google account from one user to another, never merges users and never
  changes a password.
- A new user gets the `user` role, a username from the Google name and no password. Its email is
  confirmed when Google is the authority for it. The player can set a password with password
  recovery.
- An email change at Google does not change the Cyberia user or its email.
- Several accounts with one email link nothing automatically. The server logs their ids.

## Outcomes

The callback returns `google-auth=<outcome>` to the portal:

| Outcome            | Meaning                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `success`          | The portal exchanges the ticket for a session                     |
| `link`             | The player logs in with the password once; then the account links |
| `cancelled`        | The player cancelled on the Google page                           |
| `conflict`         | The matching account already has another Google account           |
| `unverified-email` | Google did not verify the email of a new Google account           |
| `unavailable`      | Google sign-in is not configured on this host                     |
| `error`            | The state, the code exchange or the profile failed                |
