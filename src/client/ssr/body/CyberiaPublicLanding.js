// CyberiaPublicLanding.js — the Cyberia public landing page, rendered at build time from the
// project's SSR data. It reads no service at request time. A link the data does not give is left
// out. The theme control stays hidden until the theme script of CyberiaPublicCss shows it.

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const link = (href, text, className = '') =>
  href ? html`<a${className ? ` class="${className}"` : ''} href="${escapeHtml(href)}">${text}</a>` : '';

const item = (markup) => (markup ? html`<li>${markup}</li>` : '');

const icon = (ssrPath, name) =>
  html`<img class="cp-icon" src="${ssrPath}assets/ui-icons/${name}.png" alt="" width="40" height="40" />`;

const thumbnailImage = (ssrPath, world, { sizes, attributes }) =>
  html`<img
    class="cp-thumbnail"
    src="${ssrPath}${escapeHtml(world.thumbnail.src)}"
    srcset="${world.thumbnail.srcset.map(({ file, width }) => `${ssrPath}${escapeHtml(file)} ${width}w`).join(', ')}"
    sizes="${sizes}"
    width="${world.thumbnail.width}"
    height="${world.thumbnail.height}"
    alt="${escapeHtml(`A scene of the world ${world.name}`)}"
    ${attributes}
  />`;

const THEMES = [
  ['system', 'Auto'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

const worldItem = (ssrPath, world) => html`
  <li class="cp-world">
    <div class="cp-world-art">
      ${
        world.thumbnail
          ? thumbnailImage(ssrPath, world, {
              sizes: '(min-width: 76rem) 24rem, (min-width: 42rem) 50vw, 100vw',
              attributes: 'loading="lazy" decoding="async"',
            })
          : icon(ssrPath, 'map')
      }
    </div>
    <div class="cp-world-body">
      <h3>${escapeHtml(world.name)}</h3>
      ${world.description ? html`<p>${escapeHtml(world.description)}</p>` : ''}
      <a class="cp-button cp-button-primary" href="${escapeHtml(world.href)}"
        >Play<span class="cp-visually-hidden"> ${escapeHtml(world.name)}</span></a
      >
    </div>
  </li>
`;

const feature = (ssrPath, { iconName, title, text }) => html`
  <li class="cp-feature">
    ${icon(ssrPath, iconName)}
    <h3>${title}</h3>
    <p>${text}</p>
  </li>
`;

const STUDIO_FEATURES = [
  { iconName: 'map', title: 'Maps', text: 'Place the entities of each map, and join maps into worlds with portals.' },
  {
    iconName: 'character',
    title: 'Entities',
    text: 'Give players, creatures and characters their skin and their stats.',
  },
  { iconName: 'object-layer', title: 'Items', text: 'Paint the frames of an item and define it in the Object Layer.' },
  {
    iconName: 'quest',
    title: 'Quests',
    text: 'Compose a saga from one idea: its quests, its dialogue and its characters.',
  },
];

const UNIVERSE_FEATURES = [
  {
    iconName: 'transport',
    title: 'Worlds and portals',
    text: 'Each world is a set of maps. Portals join the maps, and travel takes you from world to world.',
  },
  {
    iconName: 'party',
    title: 'Real time, in the browser',
    text: 'A server runs every world live. Tap to move, fight and gather with the players around you.',
  },
  {
    iconName: 'market',
    title: 'Loot and markets',
    text: 'Pick up drops, equip what you find and trade at the markets. The open alpha economy is off-chain.',
  },
  {
    iconName: 'lore',
    title: 'Sagas',
    text: 'Sagas add new regions, their quests and their characters to the universe.',
  },
];

SSRComponent = ({ title, description, author, ssrPath, data }) => {
  const { links = {}, worlds = [] } = data ?? {};
  const hero = worlds.find((world) => world.thumbnail);
  return html`
    <a class="cp-skip" href="#main">Skip to content</a>
    <header class="cp-header">
      <div class="cp-shell cp-header-row">
        <a class="cp-brand" href="${ssrPath}">
          <img src="${ssrPath}assets/logo/base-icon.png" alt="" width="36" height="36" />
          <span>CYBERIA</span>
        </a>
        <nav class="cp-nav" aria-label="Main">
          <ul class="cp-nav-sections">
            <li><a href="#worlds">Worlds</a></li>
            <li><a href="#studio">Studio</a></li>
            <li><a href="#universe">Universe</a></li>
            ${item(link(links.docs, 'Docs'))}
          </ul>
          <ul class="cp-nav-actions">
            ${item(link(links.portal, 'Open portal', 'cp-button cp-button-ghost'))}
            ${item(link(links.play, 'Play', 'cp-button cp-button-primary'))}
          </ul>
        </nav>
        <fieldset class="cp-theme" hidden>
          <legend class="cp-visually-hidden">Color theme</legend>
          ${THEMES.map(
            ([value, label]) =>
              html`<label><input type="radio" name="cp-theme" value="${value}" /><span>${label}</span></label>`,
          ).join('')}
        </fieldset>
      </div>
    </header>
    <main id="main">
      <section class="cp-hero" aria-labelledby="cp-title">
        <div class="cp-shell cp-hero-row">
          <div class="cp-hero-copy">
            <p class="cp-eyebrow">Open alpha · Free browser MMORPG</p>
            <h1 id="cp-title">${escapeHtml(title)}</h1>
            <p class="cp-lead">${escapeHtml(description)}</p>
            <div class="cp-actions">
              ${link(links.play, 'Play now', 'cp-button cp-button-primary cp-button-large')}
              ${link(links.signUp, 'Create an account', 'cp-button cp-button-ghost cp-button-large')}
            </div>
            <p class="cp-note">No download. Play as a guest, or keep your progress with an account.</p>
          </div>
          <figure class="cp-hero-art">
            ${
              hero
                ? html`${thumbnailImage(ssrPath, hero, {
                      sizes: '(min-width: 60rem) 32rem, 100vw',
                      attributes: 'fetchpriority="high" decoding="async"',
                    })}
                    <figcaption>${escapeHtml(hero.name)}</figcaption>`
                : html`<img
                    class="cp-hero-logo"
                    src="${ssrPath}assets/logo/base-icon.png"
                    alt=""
                    width="400"
                    height="400"
                  />`
            }
          </figure>
        </div>
      </section>

      <section id="worlds" class="cp-section" aria-labelledby="cp-worlds-title">
        <div class="cp-shell">
          <div class="cp-section-head">
            <h2 id="cp-worlds-title">Worlds</h2>
            <p>Pick a world and enter it from your browser.</p>
          </div>
          ${
            worlds.length > 0
              ? html`<ul class="cp-worlds">
                  ${worlds.map((world) => worldItem(ssrPath, world)).join('')}
                </ul>`
              : html`<div class="cp-empty">
                  ${icon(ssrPath, 'map')}
                  <p>No world is published here yet. Every open world is in the world list.</p>
                </div>`
          }
          ${links.worlds ? html`<p class="cp-more">${link(links.worlds, 'Open the world list')}</p>` : ''}
        </div>
      </section>

      <section id="studio" class="cp-section cp-section-alt" aria-labelledby="cp-studio-title">
        <div class="cp-shell">
          <div class="cp-section-head">
            <h2 id="cp-studio-title">Cyberia Studio</h2>
            <p>The universe is made in Cyberia Studio. Log in to open it: what you can edit follows your role.</p>
          </div>
          <ul class="cp-features">
            ${STUDIO_FEATURES.map((entry) => feature(ssrPath, entry)).join('')}
          </ul>
          ${links.studio ? html`<p class="cp-more">${link(links.studio, 'Open Cyberia Studio', 'cp-button cp-button-ghost')}</p>` : ''}
        </div>
      </section>

      <section id="universe" class="cp-section" aria-labelledby="cp-universe-title">
        <div class="cp-shell">
          <div class="cp-section-head">
            <h2 id="cp-universe-title">One universe, many worlds</h2>
            <p>A sandbox pixel-art universe that grows with every release.</p>
          </div>
          <ul class="cp-features">
            ${UNIVERSE_FEATURES.map((entry) => feature(ssrPath, entry)).join('')}
          </ul>
        </div>
      </section>
    </main>
    <footer class="cp-footer">
      <div class="cp-shell cp-footer-grid">
        <div class="cp-footer-brand">
          <a class="cp-brand" href="${ssrPath}">
            <img src="${ssrPath}assets/logo/base-icon.png" alt="" width="28" height="28" />
            <span>CYBERIA</span>
          </a>
          <p>A browser MMORPG of an evolving pixel-art universe.</p>
        </div>
        <nav aria-labelledby="cp-footer-play">
          <h2 id="cp-footer-play">Play</h2>
          <ul>
            ${item(link(links.play, 'Play now'))} ${item(link(links.worlds, 'World list'))}
            ${item(link(links.signUp, 'Create an account'))} ${item(link(links.portal, 'Open portal'))}
          </ul>
        </nav>
        <nav aria-labelledby="cp-footer-create">
          <h2 id="cp-footer-create">Create</h2>
          <ul>
            ${item(link(links.studio, 'Cyberia Studio'))} ${item(link(links.docs, 'Documentation'))}
          </ul>
        </nav>
        <nav aria-labelledby="cp-footer-ecosystem">
          <h2 id="cp-footer-ecosystem">Ecosystem</h2>
          <ul>
            ${item(link(links.objectLayer, 'Object Layer'))} ${item(link(links.itemLedger, 'Item Ledger'))}
            ${item(link(author, 'Source code'))}
          </ul>
        </nav>
      </div>
      <div class="cp-shell cp-footer-base">
        <p>© ${new Date().getFullYear()} Underpost · Open alpha</p>
      </div>
    </footer>
  `;
};
