// CyberiaPublicCss.js — the styles of the Cyberia public website. Self-hosted font, no script.

SSRComponent = ({ ssrPath }) => html`
  <style>
    @font-face {
      font-family: 'cyberia-display';
      src: url('${ssrPath}assets/fonts/Jersey15-Regular.ttf') format('truetype');
      font-display: swap;
    }

    :root {
      color-scheme: dark;
      --cp-bg: #121212;
      --cp-surface: #1c1c1c;
      --cp-surface-raised: #242424;
      --cp-border: #3a3a3a;
      --cp-text: #ececec;
      --cp-text-muted: #b5b5b5;
      --cp-accent: #ffcc00;
      --cp-accent-strong: #ffd84d;
      --cp-on-accent: #121212;
      --cp-radius: 10px;
      --cp-shell: 72rem;
      --cp-gutter: clamp(1rem, 4vw, 2rem);
      --cp-font-display: 'cyberia-display', ui-monospace, monospace;
      --cp-font-body: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    body {
      background: var(--cp-bg);
      color: var(--cp-text);
      font-family: var(--cp-font-body);
      font-size: 1rem;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    a {
      color: var(--cp-accent);
      text-underline-offset: 0.2em;
    }

    a:hover {
      color: var(--cp-accent-strong);
    }

    :focus-visible {
      outline: 3px solid var(--cp-accent);
      outline-offset: 3px;
    }

    .cp-shell {
      box-sizing: border-box;
      width: 100%;
      max-width: var(--cp-shell);
      margin: 0 auto;
      padding: 0 var(--cp-gutter);
    }

    .cp-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    .cp-skip {
      position: absolute;
      left: var(--cp-gutter);
      top: -4rem;
      z-index: 2;
      padding: 0.5rem 1rem;
      background: var(--cp-accent);
      color: var(--cp-on-accent);
      border-radius: var(--cp-radius);
      font-weight: 600;
    }

    .cp-skip:focus {
      top: 0.75rem;
    }

    .cp-header {
      position: sticky;
      top: 0;
      z-index: 1;
      background: rgba(18, 18, 18, 0.92);
      border-bottom: 1px solid var(--cp-border);
      backdrop-filter: blur(8px);
    }

    .cp-header-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1.5rem;
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
      letter-spacing: 0.06em;
      text-decoration: none;
    }

    .cp-brand img {
      image-rendering: pixelated;
    }

    .cp-nav {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 1.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .cp-nav a:not(.cp-button) {
      color: var(--cp-text);
      text-decoration: none;
    }

    .cp-nav a:not(.cp-button):hover {
      color: var(--cp-accent);
    }

    .cp-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-height: 2.75rem;
      padding: 0.5rem 1.25rem;
      border: 2px solid var(--cp-accent);
      border-radius: var(--cp-radius);
      font-weight: 600;
      text-decoration: none;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }

    .cp-button-primary {
      background: var(--cp-accent);
      color: var(--cp-on-accent);
    }

    .cp-button-primary:hover {
      background: var(--cp-accent-strong);
      color: var(--cp-on-accent);
    }

    .cp-button-ghost {
      color: var(--cp-accent);
    }

    .cp-button-ghost:hover {
      background: var(--cp-accent);
      color: var(--cp-on-accent);
    }

    .cp-hero {
      padding: clamp(3rem, 10vw, 7rem) 0 clamp(2.5rem, 8vw, 5rem);
      background:
        linear-gradient(180deg, rgba(255, 204, 0, 0.08), transparent 60%),
        repeating-linear-gradient(0deg, transparent 0 31px, rgba(255, 255, 255, 0.03) 31px 32px),
        repeating-linear-gradient(90deg, transparent 0 31px, rgba(255, 255, 255, 0.03) 31px 32px);
      border-bottom: 1px solid var(--cp-border);
    }

    .cp-eyebrow {
      margin: 0 0 0.5rem;
      color: var(--cp-accent);
      font-size: 0.875rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .cp-hero h1 {
      margin: 0;
      font-family: var(--cp-font-display);
      font-size: clamp(3rem, 12vw, 6.5rem);
      font-weight: 400;
      line-height: 0.95;
      letter-spacing: 0.04em;
    }

    .cp-lead {
      max-width: 40rem;
      margin: 1.25rem 0 2rem;
      color: var(--cp-text-muted);
      font-size: clamp(1.05rem, 2.5vw, 1.25rem);
    }

    .cp-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .cp-section {
      padding: clamp(2.5rem, 8vw, 4.5rem) 0;
    }

    .cp-section + .cp-section {
      border-top: 1px solid var(--cp-border);
    }

    .cp-section h2 {
      margin: 0 0 1.5rem;
      font-family: var(--cp-font-display);
      font-size: clamp(2rem, 6vw, 3rem);
      font-weight: 400;
      letter-spacing: 0.04em;
    }

    .cp-section p {
      max-width: 44rem;
    }

    .cp-worlds {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
      gap: 1rem;
      margin: 0 0 1.5rem;
      padding: 0;
      list-style: none;
    }

    .cp-world {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      height: 100%;
      box-sizing: border-box;
      padding: 1.25rem;
      background: var(--cp-surface);
      border: 1px solid var(--cp-border);
      border-radius: var(--cp-radius);
    }

    .cp-world h3 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.3;
    }

    .cp-world p {
      flex: 1;
      margin: 0;
      color: var(--cp-text-muted);
    }

    .cp-world .cp-button {
      align-self: flex-start;
    }

    .cp-empty {
      padding: 1.25rem;
      background: var(--cp-surface);
      border: 1px dashed var(--cp-border);
      border-radius: var(--cp-radius);
      color: var(--cp-text-muted);
    }

    .cp-footer {
      padding: 2rem 0;
      background: var(--cp-surface);
      border-top: 1px solid var(--cp-border);
      color: var(--cp-text-muted);
      font-size: 0.9rem;
    }

    .cp-footer-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .cp-footer ul {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    @media (prefers-reduced-motion: reduce) {
      html {
        scroll-behavior: auto;
      }

      .cp-button {
        transition: none;
      }
    }
  </style>
`;
