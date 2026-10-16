// GameLaunchCyberia.js — how the portal sends a player into a world, and where the game lives.
//
// Every launch goes through the launch bridge, the portal view `/launch`. The bridge asks for a
// single-use ticket for the session of this browser (the signed-in account, or a guest on
// request) and opens the game client with the ticket in the URL fragment. The game origins come
// from the build manifest, so a development portal opens the development client and never falls
// back to production.

import { Auth } from '../core/Auth.js';
import { buildManifest } from '../core/BuildManifest.js';
import { RouterReady, getProxyPath } from '../core/Router.js';
import { s } from '../core/VanillaJs.js';
import { DEFAULT_INSTANCE_CODE, worldPathOf } from './SharedDefaultsCyberia.js';

/**
 * The origin of a Cyberia runtime in this build: `cyberia-client` or `cyberia-server`.
 * @param {string} runtime
 * @returns {string}
 * @throws {Error} When the build manifest names no origin for it.
 */
const gameOrigin = (runtime) => {
  const origin = buildManifest().runtime.instanceOrigins?.[runtime];
  if (!origin) throw new Error(`The build manifest names no origin for ${runtime}`);
  return origin;
};

/** The game client page of a world. */
const gameClientUrl = (code) => `${gameOrigin('cyberia-client')}${worldPathOf(code)}`;

/** The authoritative server of a world, for its metrics API. */
const gameServerUrl = (code) => `${gameOrigin('cyberia-server')}${worldPathOf(code)}`;

/**
 * The launch bridge of a world. `as` asks for an `account` or a `guest` session; without it the
 * bridge launches a signed-in account and offers the choice otherwise.
 * @param {string} code
 * @param {'account'|'guest'} [as]
 * @returns {string}
 */
const launchUrl = (code, as) => {
  const query = new URLSearchParams({ world: code || DEFAULT_INSTANCE_CODE });
  if (as) query.set('as', as);
  return `${getProxyPath()}launch?${query}`;
};

/** Enters a world through the launch bridge. */
const launchWorld = (code) => location.assign(launchUrl(code));

// The world a sign-in launches once it completes: a convenience of this tab, never a credential.
const PENDING_PLAY_KEY = 'cyberia-pending-play';

const pendingPlay = {
  get: () => {
    try {
      return sessionStorage.getItem(PENDING_PLAY_KEY);
    } catch {
      return null;
    }
  },
  set: (code) => {
    try {
      if (code === null) sessionStorage.removeItem(PENDING_PLAY_KEY);
      else sessionStorage.setItem(PENDING_PLAY_KEY, code);
    } catch {
      // Without session storage the player presses Play again after sign-in.
    }
  },
};

/** Removes one query parameter from the address bar. */
const dropParam = (params, name) => {
  params.delete(name);
  const query = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
};

/**
 * Completes what a link from the game asked the portal: `?signout` ends the session of the
 * account; `?play=<code>`, or a Play interrupted by sign-in, launches that world as the account
 * once it is signed in, and opens the sign-in otherwise.
 */
const resumeLaunch = async () => {
  const params = new URLSearchParams(location.search);
  if (params.has('signout')) {
    dropParam(params, 'signout');
    if (Auth.getToken()) await Auth.sessionOut();
  }
  let code = pendingPlay.get();
  if (params.has('play')) {
    code = params.get('play') || DEFAULT_INSTANCE_CODE;
    dropParam(params, 'play');
  }
  if (!code) return;
  if (Auth.getToken()) {
    pendingPlay.set(null);
    return location.assign(launchUrl(code, 'account'));
  }
  pendingPlay.set(code);
  RouterReady.then(() => s(`.main-btn-log-in`)?.click());
};

export { gameClientUrl, gameServerUrl, launchUrl, launchWorld, resumeLaunch };
