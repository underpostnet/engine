// CyberiaPublicCss.js — the styles of the Cyberia public website: a dark and a light theme, from the
// choice the visitor stored or else their color scheme, and a self-hosted pixel font. The theme
// script applies the stored choice before the first paint, then shows and drives the theme control.

const THEME_KEY = 'cyberia-color-scheme';

const LIGHT_TOKENS = `
  color-scheme: light;
  --cp-bg: #f4f6fb;
  --cp-bg-alt: #e9edf6;
  --cp-surface: #ffffff;
  --cp-border: #c6cedd;
  --cp-text: #0d1322;
  --cp-text-muted: #414b60;
  --cp-link: #075985;
  --cp-eyebrow: #0369a1;
  --cp-focus: #0d1322;
  --cp-ghost: #0d1322;
  --cp-header-bg: rgba(244, 246, 251, 0.9);
  --cp-shadow: 0 10px 28px rgba(13, 19, 34, 0.1);
  --cp-glow-a: rgba(60, 200, 255, 0.24);
  --cp-glow-b: rgba(170, 110, 255, 0.18);
  --cp-grid-line: rgba(13, 19, 34, 0.05);
  --cp-title-glow: none;
`;

const themeScript = () =>
  html`<script>
    (() => {
      const key = '${THEME_KEY}';
      const root = document.documentElement;
      const stored = () => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      };
      const apply = (theme) =>
        theme === 'light' || theme === 'dark'
          ? root.setAttribute('data-color-scheme', theme)
          : root.removeAttribute('data-color-scheme');
      apply(stored());
      document.addEventListener('DOMContentLoaded', () => {
        const control = document.querySelector('.cp-theme');
        if (!control) return;
        const current = stored() || 'system';
        for (const input of control.querySelectorAll('input')) {
          input.checked = input.value === current;
          input.addEventListener('change', () => {
            try {
              if (input.value === 'system') localStorage.removeItem(key);
              else localStorage.setItem(key, input.value);
            } catch {}
            apply(input.value);
          });
        }
        control.hidden = false;
      });
    })();
  </script>`;

SSRComponent = ({ ssrPath }) => html`
  ${themeScript()}
  <link rel="preload" href="${ssrPath}assets/fonts/Jersey15-Regular.ttf" as="font" type="font/ttf" crossorigin />
  <style>
    @font-face {
      font-family: 'cyberia-display';
      src: url('${ssrPath}assets/fonts/Jersey15-Regular.ttf') format('truetype');
      font-display: swap;
    }

    /* The game palette: the void, frame and portal colors of the world previews, and the gold of the portal. */
    :root {
      color-scheme: dark light;
      --cp-void: #070b14;
      --cp-on-void: #b4bccc;
      --cp-portal: #3cc8ff;
      --cp-portal-intra: #aa6eff;
      --cp-gold: #ffcc00;
      --cp-gold-strong: #ffd84d;
      --cp-on-gold: #121212;

      --cp-bg: #0b0f19;
      --cp-bg-alt: #0f1522;
      --cp-surface: #141b2b;
      --cp-border: #2a3550;
      --cp-text: #eef1f7;
      --cp-text-muted: #b4bccc;
      --cp-link: #ffd84d;
      --cp-eyebrow: #3cc8ff;
      --cp-focus: #ffcc00;
      --cp-ghost: #ffcc00;
      --cp-header-bg: rgba(11, 15, 25, 0.88);
      --cp-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      --cp-glow-a: rgba(60, 200, 255, 0.16);
      --cp-glow-b: rgba(170, 110, 255, 0.16);
      --cp-grid-line: rgba(255, 255, 255, 0.035);
      --cp-title-glow: 0 0 28px rgba(60, 200, 255, 0.35);

      --cp-radius: 8px;
      --cp-shell: 76rem;
      --cp-gutter: clamp(1rem, 4vw, 2rem);
      --cp-font-display: 'cyberia-display', ui-monospace, monospace;
      --cp-font-body: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      scroll-padding-top: 5.5rem;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-color-scheme='dark']) {
        ${LIGHT_TOKENS}
      }
    }

    :root[data-color-scheme='light'] {
      ${LIGHT_TOKENS}
    }

    :root[data-color-scheme='dark'] {
      color-scheme: dark;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      background: var(--cp-bg);
      color: var(--cp-text);
      font-family: var(--cp-font-body);
      font-size: 1rem;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    a {
      color: var(--cp-link);
      text-underline-offset: 0.2em;
    }

    :focus-visible {
      outline: 3px solid var(--cp-focus);
      outline-offset: 3px;
    }

    .cp-shell {
      width: 100%;
      max-width: var(--cp-shell);
      margin: 0 auto;
      padding: 0 var(--cp-gutter);
    }

    .cp-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }

    .cp-skip {
      position: absolute;
      left: var(--cp-gutter);
      top: -4rem;
      z-index: 3;
      padding: 0.5rem 1rem;
      background: var(--cp-gold);
      color: var(--cp-on-gold);
      border-radius: var(--cp-radius);
      font-weight: 700;
    }

    .cp-skip:focus {
      top: 0.75rem;
    }

    .cp-icon {
      width: 40px;
      height: 40px;
      image-rendering: pixelated;
    }

    /* Header */

    .cp-header {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--cp-header-bg);
      border-bottom: 1px solid var(--cp-border);
      backdrop-filter: blur(8px);
    }

    .cp-header-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1.5rem;
      min-height: 4rem;
      padding-top: 0.5rem;
      padding-bottom: 0.5rem;
    }

    .cp-brand {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--cp-text);
      font-family: var(--cp-font-display);
      font-size: 1.75rem;
      letter-spacing: 0.08em;
      text-decoration: none;
    }

    .cp-brand img {
      image-rendering: pixelated;
    }

    .cp-nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1.5rem;
      margin-left: auto;
    }

    .cp-nav ul {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 1.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cp-nav-actions {
      column-gap: 0.5rem;
    }

    .cp-nav-sections a {
      display: inline-block;
      padding: 0.5rem 0;
      color: var(--cp-text);
      text-decoration: none;
    }

    .cp-nav-sections a:hover {
      color: var(--cp-link);
      text-decoration: underline;
    }

    /* A narrow header wraps to rows, so it scrolls away instead of covering the page. */
    @media (max-width: 40rem) {
      .cp-header {
        position: static;
      }

      .cp-brand {
        font-size: 1.4rem;
      }

      .cp-theme {
        order: 1;
        margin-left: auto;
      }

      .cp-theme span {
        padding: 0 0.5rem;
      }

      .cp-nav {
        order: 2;
        width: 100%;
        margin-left: 0;
        justify-content: space-between;
      }
    }

    /* Buttons: a pixel bevel, no rounded pill. */

    .cp-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.75rem;
      padding: 0.5rem 1.25rem;
      border: 2px solid var(--cp-gold);
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-decoration: none;
      transition:
        background-color 0.15s ease,
        color 0.15s ease,
        transform 0.15s ease;
    }

    .cp-button-primary {
      background: var(--cp-gold);
      color: var(--cp-on-gold);
      box-shadow:
        inset 0 2px 0 rgba(255, 255, 255, 0.45),
        inset 0 -3px 0 rgba(0, 0, 0, 0.22);
    }

    .cp-button-primary:hover {
      background: var(--cp-gold-strong);
      color: var(--cp-on-gold);
    }

    .cp-button-ghost {
      border-color: var(--cp-ghost);
      color: var(--cp-ghost);
    }

    .cp-button-ghost:hover {
      background: var(--cp-gold);
      border-color: var(--cp-gold);
      color: var(--cp-on-gold);
    }

    .cp-button:active {
      transform: translateY(1px);
    }

    .cp-button-large {
      min-height: 3.25rem;
      padding: 0.75rem 1.75rem;
      font-size: 1.05rem;
    }

    /* Hero */

    .cp-hero {
      padding: clamp(3rem, 9vw, 6.5rem) 0 clamp(3rem, 8vw, 5.5rem);
      background:
        radial-gradient(60rem 30rem at 85% 0%, var(--cp-glow-a), transparent 60%),
        radial-gradient(50rem 28rem at 0% 100%, var(--cp-glow-b), transparent 60%),
        linear-gradient(var(--cp-grid-line) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px) 0 0 / 32px 32px,
        var(--cp-bg);
      border-bottom: 1px solid var(--cp-border);
    }

    .cp-hero-row {
      display: grid;
      gap: clamp(2rem, 6vw, 4rem);
      align-items: center;
    }

    @media (min-width: 60rem) {
      .cp-hero-row {
        grid-template-columns: 1.1fr 0.9fr;
      }
    }

    .cp-eyebrow {
      margin: 0 0 0.75rem;
      color: var(--cp-eyebrow);
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .cp-hero h1 {
      margin: 0;
      font-family: var(--cp-font-display);
      font-size: clamp(3.25rem, 11vw, 6rem);
      font-weight: 400;
      line-height: 0.95;
      letter-spacing: 0.04em;
      text-shadow: var(--cp-title-glow);
    }

    .cp-lead {
      max-width: 38rem;
      margin: 1.25rem 0 2rem;
      color: var(--cp-text-muted);
      font-size: clamp(1.05rem, 2.4vw, 1.25rem);
    }

    .cp-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .cp-note {
      margin: 1rem 0 0;
      color: var(--cp-text-muted);
      font-size: 0.9rem;
    }

    .cp-hero-art {
      position: relative;
      margin: 0;
      padding: 0.75rem;
      background: var(--cp-void);
      border: 2px solid var(--cp-border);
      border-radius: var(--cp-radius);
      box-shadow:
        var(--cp-shadow),
        0 0 0 1px rgba(60, 200, 255, 0.15),
        0 0 48px rgba(60, 200, 255, 0.18);
    }

    /* Pixel corner marks, as the frame of a game window. */
    .cp-hero-art::before,
    .cp-hero-art::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      border: 4px solid var(--cp-portal);
    }

    .cp-hero-art::before {
      top: -6px;
      left: -6px;
      border-right: 0;
      border-bottom: 0;
    }

    .cp-hero-art::after {
      right: -6px;
      bottom: -6px;
      border-left: 0;
      border-top: 0;
      border-color: var(--cp-portal-intra);
    }

    .cp-hero-art img {
      display: block;
      width: 100%;
      border-radius: 4px;
    }

    .cp-hero-art .cp-hero-logo {
      width: min(100%, 18rem);
      margin: 2rem auto;
      image-rendering: pixelated;
    }

    .cp-hero-art figcaption {
      padding: 0.6rem 0.25rem 0;
      color: var(--cp-on-void);
      font-family: var(--cp-font-display);
      font-size: 1.25rem;
      letter-spacing: 0.06em;
    }

    /* Sections */

    .cp-section {
      padding: clamp(3rem, 8vw, 5rem) 0;
    }

    .cp-section-alt {
      background: var(--cp-bg-alt);
      border-top: 1px solid var(--cp-border);
      border-bottom: 1px solid var(--cp-border);
    }

    .cp-section-head {
      max-width: 44rem;
      margin-bottom: 2rem;
    }

    .cp-section-head h2 {
      margin: 0;
      font-family: var(--cp-font-display);
      font-size: clamp(2.25rem, 6vw, 3.25rem);
      font-weight: 400;
      line-height: 1;
      letter-spacing: 0.04em;
    }

    .cp-section-head h2::after {
      content: '';
      display: block;
      width: 3rem;
      height: 4px;
      margin-top: 0.75rem;
      background: linear-gradient(90deg, var(--cp-portal), var(--cp-portal-intra));
    }

    .cp-section-head p {
      margin: 1rem 0 0;
      color: var(--cp-text-muted);
      font-size: 1.1rem;
    }

    .cp-more {
      margin: 2rem 0 0;
    }

    /* World cards */

    .cp-worlds {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
      gap: 1.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cp-world {
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--cp-surface);
      border: 1px solid var(--cp-border);
      border-radius: var(--cp-radius);
      box-shadow: var(--cp-shadow);
      transition:
        border-color 0.15s ease,
        transform 0.15s ease;
    }

    .cp-world:hover,
    .cp-world:focus-within {
      border-color: var(--cp-portal);
      transform: translateY(-2px);
    }

    /* One image height for every card: the thumbnail covers it, centered, and zooms on hover. */
    .cp-world-art {
      position: relative;
      display: grid;
      place-items: center;
      height: 12rem;
      overflow: hidden;
      background: var(--cp-void);
      border-bottom: 1px solid var(--cp-border);
    }

    .cp-world-art::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(7, 11, 20, 0.45), transparent 50%);
    }

    .cp-world-art .cp-icon {
      width: 64px;
      height: 64px;
    }

    .cp-world-art .cp-thumbnail {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      transition: transform 0.4s ease;
    }

    .cp-world:hover .cp-thumbnail,
    .cp-world:focus-within .cp-thumbnail {
      transform: scale(1.06);
    }

    .cp-world-body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1.25rem;
    }

    .cp-world h3 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.3;
    }

    .cp-world p {
      display: -webkit-box;
      flex: 1;
      margin: 0;
      overflow: hidden;
      color: var(--cp-text-muted);
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4;
      line-clamp: 4;
    }

    .cp-world .cp-button {
      align-self: flex-start;
      margin-top: auto;
    }

    /* The Play link covers the card, so the whole card opens the world with one link. */
    .cp-world .cp-button::after {
      content: '';
      position: absolute;
      inset: 0;
    }

    .cp-empty {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.5rem;
      background: var(--cp-surface);
      border: 2px dashed var(--cp-border);
      border-radius: var(--cp-radius);
      color: var(--cp-text-muted);
    }

    .cp-empty p {
      margin: 0;
    }

    /* Feature tiles */

    .cp-features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
      gap: 1.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cp-feature {
      padding: 1.5rem;
      background: var(--cp-surface);
      border: 1px solid var(--cp-border);
      border-radius: var(--cp-radius);
    }

    .cp-feature h3 {
      margin: 0.75rem 0 0.4rem;
      font-size: 1.15rem;
    }

    .cp-feature p {
      margin: 0;
      color: var(--cp-text-muted);
    }

    /* Footer */

    .cp-footer {
      padding: 3rem 0 1.5rem;
      background: var(--cp-bg-alt);
      border-top: 1px solid var(--cp-border);
      color: var(--cp-text-muted);
      font-size: 0.95rem;
    }

    .cp-footer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
      gap: 2rem;
    }

    .cp-footer-brand {
      grid-column: span 2;
    }

    @media (max-width: 30rem) {
      .cp-footer-brand {
        grid-column: auto;
      }
    }

    .cp-footer-brand p {
      max-width: 20rem;
      margin: 0.75rem 0 0;
    }

    .cp-footer h2 {
      margin: 0 0 0.75rem;
      color: var(--cp-text);
      font-size: 0.8rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .cp-footer ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cp-footer li a {
      display: inline-block;
      padding: 0.3rem 0;
      color: var(--cp-text-muted);
    }

    .cp-footer li a:hover {
      color: var(--cp-link);
    }

    .cp-footer-base {
      margin-top: 2.5rem;
    }

    .cp-footer-base p {
      margin: 0;
      padding-top: 1.5rem;
      border-top: 1px solid var(--cp-border);
      font-size: 0.875rem;
    }

    /* Theme control: native radios, one segmented row. */

    .cp-theme {
      display: inline-flex;
      margin: 0;
      padding: 2px;
      border: 1px solid var(--cp-border);
      border-radius: 6px;
    }

    .cp-theme[hidden] {
      display: none;
    }

    .cp-theme label {
      position: relative;
    }

    .cp-theme input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    .cp-theme span {
      display: inline-flex;
      align-items: center;
      min-height: 2.25rem;
      padding: 0 0.75rem;
      border-radius: 4px;
      color: var(--cp-text-muted);
      font-size: 0.85rem;
      font-weight: 600;
    }

    .cp-theme input:checked + span {
      background: var(--cp-gold);
      color: var(--cp-on-gold);
    }

    .cp-theme input:focus-visible + span {
      outline: 3px solid var(--cp-focus);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      :root {
        scroll-behavior: auto;
      }

      .cp-button,
      .cp-world,
      .cp-thumbnail {
        transition: none;
      }

      .cp-button:active,
      .cp-world:hover,
      .cp-world:focus-within,
      .cp-world:hover .cp-thumbnail,
      .cp-world:focus-within .cp-thumbnail {
        transform: none;
      }
    }

    @media (forced-colors: active) {
      .cp-button {
        border-color: ButtonText;
      }
    }
  </style>
`;
