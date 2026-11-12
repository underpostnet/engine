// CyberiaPublicLanding.js — the Cyberia public landing page, rendered at build time from the
// project's SSR data. It ships no script and reads no service at request time. A link the data
// does not give is left out.

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const link = (href, text, className = '') =>
  href ? html`<a${className ? ` class="${className}"` : ''} href="${escapeHtml(href)}">${text}</a>` : '';

const item = (markup) => (markup ? html`<li>${markup}</li>` : '');

const worldItem = (world) => html`
  <li class="cp-world">
    <h3>${escapeHtml(world.name)}</h3>
    <p>${escapeHtml(world.description)}</p>
    <a class="cp-button cp-button-primary" href="${escapeHtml(world.href)}"
      >Play<span class="cp-visually-hidden"> ${escapeHtml(world.name)}</span></a
    >
  </li>
`;

SSRComponent = ({ title, description, author, ssrPath, data }) => {
  const { links = {}, worlds = [] } = data ?? {};
  return html`
    <a class="cp-skip" href="#main">Skip to content</a>
    <header class="cp-header">
      <div class="cp-shell cp-header-row">
        <a class="cp-brand" href="${ssrPath}">
          <img src="${ssrPath}assets/logo/base-icon.png" alt="" width="36" height="36" />
          <span>CYBERIA</span>
        </a>
        <nav aria-label="Main">
          <ul class="cp-nav">
            <li><a href="#worlds">Worlds</a></li>
            <li><a href="#create">Create</a></li>
            ${item(link(links.docs, 'Docs'))} ${item(link(links.logIn, 'Log in', 'cp-button cp-button-ghost'))}
          </ul>
        </nav>
      </div>
    </header>
    <main id="main">
      <section class="cp-hero" aria-labelledby="cp-title">
        <div class="cp-shell">
          <p class="cp-eyebrow">Free browser MMORPG</p>
          <h1 id="cp-title">${escapeHtml(title)}</h1>
          <p class="cp-lead">${escapeHtml(description)}</p>
          <div class="cp-actions">
            ${link(links.play, 'Play now', 'cp-button cp-button-primary')}
            ${link(links.signUp, 'Create an account', 'cp-button cp-button-ghost')}
          </div>
        </div>
      </section>
      <section id="worlds" class="cp-section" aria-labelledby="cp-worlds-title">
        <div class="cp-shell">
          <h2 id="cp-worlds-title">Worlds</h2>
          ${
            worlds.length > 0
              ? html`<ul class="cp-worlds">
                  ${worlds.map(worldItem).join('')}
                </ul>`
              : html`<p class="cp-empty">The published worlds appear here. Every world is open in the world list.</p>`
          }
          ${links.worlds ? html`<p>${link(links.worlds, 'See every world')}</p>` : ''}
        </div>
      </section>
      <section id="create" class="cp-section" aria-labelledby="cp-create-title">
        <div class="cp-shell">
          <h2 id="cp-create-title">Create</h2>
          <p>
            Cyberia Studio is where maps, entities, items and quests are made. Log in to open it in the Cyberia portal.
          </p>
          ${link(links.studio, 'Open Cyberia Studio', 'cp-button cp-button-ghost')}
        </div>
      </section>
    </main>
    <footer class="cp-footer">
      <div class="cp-shell cp-footer-row">
        <p>© ${new Date().getFullYear()} Underpost</p>
        <nav aria-label="Footer">
          <ul>
            ${item(link(links.docs, 'Documentation'))} ${item(link('https://objectlayer.org', 'Object Layer'))}
            ${item(link(author, 'Source code'))}
          </ul>
        </nav>
      </div>
    </footer>
  `;
};
