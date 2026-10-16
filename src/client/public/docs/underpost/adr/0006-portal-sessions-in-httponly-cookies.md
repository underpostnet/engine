# ADR 0006 — Portal sessions in HttpOnly cookies

## Status

Proposed. No code follows this record until it is accepted.

## Context

- The portal keeps the access token in `localStorage` (`jwt`; a guest uses `jwt.g`) and sends it as
  `Authorization: Bearer`. Any script that runs in a portal page can read it.
- The refresh token is an HttpOnly cookie of the exact host, `Secure` in production. It is
  `SameSite=None` when secure and `Lax` otherwise, so a cross-site request carries it in production.
  The engine stores only its hash.
- The access token binds the IP address and the user agent, and lives `ACCESS_EXPIRE_MINUTES`.
- The engine answers CORS with credentials for its configured origins. No route checks a CSRF
  token. No route needs one today, because no cookie authorizes a write.
- A content security policy with nonces limits script injection. It lowers the risk; it does not
  remove it.
- The `apiHosts` of a client send the bearer token to the API of another domain
  (`objectlayer.org`, `itemledger.com`).
- The game never receives a portal token: the launch bridge turns it into a single-use ticket.

## Decision

1. The access token moves to an HttpOnly, `Secure` cookie of the portal host with `SameSite=Lax`.
   No script reads it. The client keeps only the facts it shows: the user, the role and the expiry.
2. The refresh cookie becomes `SameSite=Strict`, scoped to the path of the refresh route.
3. Every route that changes state checks a CSRF token: the engine issues it with the session, and
   the client sends it as a header (double submit).
4. CORS with credentials answers exact origins only, never a wildcard or a reflected origin.
5. A call to the API of another domain uses a short-lived token that the portal host issues for
   that one domain, never the portal session.
6. Guests use the same cookies with the guest role.

## Migration

1. One release accepts both: the engine reads the access cookie first, then the bearer header. The
   client sends credentials and stops writing `localStorage`.
2. CSRF checks run in report mode. The logs show which callers fail; then the checks refuse.
3. The cross-domain token of step 5 replaces the bearer header for `apiHosts`.
4. The next release removes the bearer path, and the client deletes the old keys at load.

Each step deploys alone. Reverting the client build rolls a step back.

## Tests

- A script in a portal page reads no session token from `document.cookie` or `localStorage`.
- A cross-site form post without the CSRF header gets `403`.
- An unknown origin gets no `Access-Control-Allow-Origin`.
- The launch bridge still makes tickets for accounts and guests.
- Logout and password recovery end both cookies, and the game session ends with `revoked`.

## Consequences

- A script injection can still act as the user while the page is open. It can no longer take a
  token away for later use.
- Cross-domain API calls need their own short-lived token. That is the largest part of the work.
- The launch ticket contract does not change.
