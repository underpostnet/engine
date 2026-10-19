// CyberiaLaunch.js — the launch bridge: the portal view `/launch[?world=<code>][&as=account|guest]`.
// Without a world it launches the default world.
//
// It turns the session of this browser into a single-use game ticket and opens the game client
// with the ticket in the URL fragment. A signed-in account plays its saved character; a guest
// plays a session that ends when it leaves. Without a session choice it offers both.
//
// The page renders nothing the server knows about the player, and the ticket lives only in this
// script and in the fragment of the next address. The game client origin comes from the build
// manifest and the world path from the engine, so no query parameter chooses where it navigates.
// The portal session keys are those of `services/user/guest.service.js`.

const s = (el) => document.querySelector(el);

const SESSION_KEYS = { account: 'jwt', guest: 'jwt.g' };

const stored = (key) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the next launch asks for a new guest.
  }
};

const manifest = () => JSON.parse(document.getElementById('underpost-build-manifest').textContent);

const portalPath = () => manifest().runtime.basePath.replace(/\/?$/, '/');

const apiUrl = (endpoint) => {
  const { apiHosts, apiBaseHost, apiBaseProxyPath, apiBasePath } = manifest().runtime;
  const host = apiHosts?.[endpoint] || apiBaseHost || location.host;
  const base = apiBaseProxyPath ? apiBaseProxyPath.replace(/\/?$/, '/') : portalPath();
  return `${location.protocol}//${host}${base}${apiBasePath}/${endpoint}`;
};

const worldName = (code) =>
  code
    ? code
        .split(/[-_]/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
    : 'Cyberia Online';

const escapeText = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const show = (stateHtml, focus) => {
  s('.lb-state').innerHTML = stateHtml;
  if (focus) s(focus)?.focus();
};

const connecting = (text) =>
  show(
    `<div class="lb-progress" role="status"><span class="lb-spinner" aria-hidden="true"></span>${escapeText(text)}</div>`,
  );

const failure = (text) =>
  show(
    `<p class="lb-error" role="alert">${escapeText(text)}</p>
     <div class="lb-actions">
       <button class="lb-btn lb-primary" type="button" data-action="retry">Try again</button>
       <a class="lb-link" href="${portalPath()}">Back to worlds</a>
     </div>`,
    '[data-action="retry"]',
  );

const choice = () =>
  show(
    `<h2 class="lb-question">How do you want to play?</h2>
     <div class="lb-options">
       <button class="lb-btn lb-option" type="button" data-action="guest">
         <span class="lb-option-title">Continue as guest</span>
         <span class="lb-option-note">Play now. Your items and progress end when you leave.</span>
       </button>
       <button class="lb-btn lb-option lb-primary" type="button" data-action="account">
         <span class="lb-option-title">Sign in</span>
         <span class="lb-option-note">Keep your items, coins and progress between sessions.</span>
       </button>
     </div>
     <a class="lb-link" href="${portalPath()}">Back to worlds</a>`,
    '[data-action="account"]',
  );

/** Asks for a ticket with a portal token; answers the response status and its data. */
const requestTicket = async (world, token) => {
  const res = await fetch(apiUrl('cyberia-game-ticket'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ instanceCode: world }),
  });
  return { status: res.status, data: (await res.json().catch(() => ({})))?.data };
};

/** Opens the game client of the world with the ticket in the fragment. */
const enter = ({ ticket, path }) => {
  const client = manifest().runtime.instanceOrigins?.['cyberia-client'];
  if (!client) return failure('This portal does not know where the game client runs.');
  if (typeof path !== 'string' || !/^(\/[A-Za-z0-9._%-]+)?$/.test(path))
    return failure('The world answered no valid address.');
  location.replace(`${client}${path}#ticket=${encodeURIComponent(ticket)}`);
};

const explain = (status) =>
  ({
    404: 'This world does not exist.',
    409: 'This world keeps no account progress yet. Play it as a guest.',
    429: 'Too many launches in a short time. Wait a minute and try again.',
    503: 'This world has no server open now. Try again in a moment, or pick another world.',
  })[status] ?? 'The world cannot open now. Try again in a moment.';

const signIn = (world) => location.assign(`${portalPath()}?play=${encodeURIComponent(world)}`);

const launchAccount = async (world) => {
  connecting(`Opening ${worldName(world)}…`);
  const { status, data } = await requestTicket(world, stored(SESSION_KEYS.account));
  if (status === 200) return enter(data);
  if (status === 401 || status === 403) return signIn(world);
  failure(explain(status));
};

const guestToken = async () => {
  const res = await fetch(apiUrl('user/guest'), { method: 'POST' });
  const token = res.ok ? (await res.json())?.data?.token : '';
  if (token) store(SESSION_KEYS.guest, token);
  return token;
};

const launchGuest = async (world) => {
  connecting(`Opening ${worldName(world)} as a guest…`);
  let token = stored(SESSION_KEYS.guest) || (await guestToken());
  let { status, data } = token ? await requestTicket(world, token) : { status: 503 };
  if (status === 401 && (token = await guestToken())) ({ status, data } = await requestTicket(world, token));
  if (status === 200) return enter(data);
  failure(explain(status));
};

/** The logo and the pixel font of the portal, from its own base path. */
const brand = () => {
  s('.lb-logo').src = `${portalPath()}assets/logo/base-icon.png`;
  new FontFace('cy-launch', `url(${portalPath()}assets/fonts/Jersey15-Regular.ttf)`)
    .load()
    .then((face) => document.fonts.add(face))
    .catch(() => undefined);
};

const main = () => {
  brand();
  const query = new URLSearchParams(location.search);
  const world = (query.get('world') || '').trim();
  const as = query.get('as');
  s('.lb-world').textContent = worldName(world);
  s('.lb-brand').hidden = !world;
  const run = (mode) => (mode === 'guest' ? launchGuest(world) : launchAccount(world)).catch(() => failure(explain(0)));
  s('.lb-state').addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') location.reload();
    else if (action === 'guest') run('guest');
    else if (action === 'account') stored(SESSION_KEYS.account) ? run('account') : signIn(world);
  });
  if (as === 'guest') return run('guest');
  if (stored(SESSION_KEYS.account)) return run('account');
  if (as === 'account') return signIn(world);
  choice();
};

SSRComponent = () =>
  html`<style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at 50% 30%, #12233f 0%, #070b14 60%), #070b14;
        color: #e6edf7;
        font-family: 'cy-launch', ui-monospace, monospace;
        font-size: 20px;
        line-height: 1.35;
      }
      .lb-card {
        box-sizing: border-box;
        width: min(440px, calc(100vw - 32px));
        padding: 28px 24px 24px;
        border: 2px solid #3a4f78;
        background: rgba(10, 16, 30, 0.92);
        box-shadow:
          0 0 0 4px #070b14,
          0 12px 40px rgba(0, 0, 0, 0.6);
        text-align: center;
      }
      .lb-logo {
        width: 72px;
        height: 72px;
        image-rendering: pixelated;
      }
      .lb-brand {
        margin: 8px 0 0;
        font-size: 16px;
        letter-spacing: 3px;
        color: #9fb3d9;
        text-transform: uppercase;
      }
      .lb-world {
        margin: 4px 0 20px;
        font-size: 30px;
        font-weight: normal;
        color: #ffffff;
      }
      .lb-question {
        margin: 0 0 14px;
        font-size: 20px;
        font-weight: normal;
      }
      .lb-options,
      .lb-actions {
        display: grid;
        gap: 10px;
        margin-bottom: 16px;
      }
      .lb-btn {
        font: inherit;
        color: inherit;
        cursor: pointer;
        border: 2px solid #3a4f78;
        background: #141f36;
        padding: 12px 14px;
        min-height: 48px;
      }
      .lb-btn:hover {
        background: #1c2b4b;
      }
      .lb-btn:focus-visible,
      .lb-link:focus-visible {
        outline: 3px solid #f2c94c;
        outline-offset: 2px;
      }
      .lb-primary {
        border-color: #4f86d9;
        background: #1d3a6b;
      }
      .lb-primary:hover {
        background: #26498a;
      }
      .lb-option {
        display: grid;
        gap: 2px;
        text-align: left;
      }
      .lb-option-title {
        font-size: 22px;
      }
      .lb-option-note {
        font-size: 16px;
        color: #a9b8d4;
      }
      .lb-link {
        color: #9fc1ff;
        font-size: 18px;
      }
      .lb-progress {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-height: 48px;
      }
      .lb-spinner {
        width: 16px;
        height: 16px;
        background: #4f86d9;
        animation: lb-step 0.8s steps(4) infinite;
      }
      .lb-error {
        margin: 0 0 16px;
        color: #ffb4a8;
      }
      @keyframes lb-step {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .lb-spinner {
          animation: none;
        }
      }
    </style>
    <main class="lb-card">
      <img class="lb-logo" alt="" />
      <p class="lb-brand">Cyberia Online</p>
      <h1 class="lb-world">Cyberia Online</h1>
      <div class="lb-state" aria-live="polite">
        <div class="lb-progress" role="status"><span class="lb-spinner" aria-hidden="true"></span>Loading…</div>
      </div>
    </main>
    <script>
      {
        const s = ${s};
        const SESSION_KEYS = ${JSON.stringify(SESSION_KEYS)};
        const stored = ${stored};
        const store = ${store};
        const manifest = ${manifest};
        const portalPath = ${portalPath};
        const apiUrl = ${apiUrl};
        const worldName = ${worldName};
        const escapeText = ${escapeText};
        const show = ${show};
        const connecting = ${connecting};
        const failure = ${failure};
        const choice = ${choice};
        const requestTicket = ${requestTicket};
        const enter = ${enter};
        const explain = ${explain};
        const signIn = ${signIn};
        const launchAccount = ${launchAccount};
        const guestToken = ${guestToken};
        const launchGuest = ${launchGuest};
        const brand = ${brand};
        const main = ${main};
        main();
      }
    </script>`;
