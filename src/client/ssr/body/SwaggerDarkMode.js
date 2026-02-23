const swaggerDarkCss = css`
  /* ── Toggle button ── */
  .swagger-ui .topbar-wrapper {
    display: flex;
    align-items: center;
  }
  .swagger-theme-toggle-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 5px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    margin-left: auto;
    margin-right: 16px;
    white-space: nowrap;
    transition: background 0.2s ease;
  }
  .swagger-theme-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  /* ── Dark mode overrides — black/gray gradients ── */
  body.swagger-dark {
    background: #0f0f0f;
  }
  body.swagger-dark .swagger-ui {
    background: #0f0f0f;
  }
  body.swagger-dark .swagger-ui .wrapper {
    background: #0f0f0f;
  }

  /* Info block */
  body.swagger-dark .swagger-ui .info .title,
  body.swagger-dark .swagger-ui .info h1,
  body.swagger-dark .swagger-ui .info h2,
  body.swagger-dark .swagger-ui .info h3,
  body.swagger-dark .swagger-ui .info p,
  body.swagger-dark .swagger-ui .info li,
  body.swagger-dark .swagger-ui .info a {
    color: #e8e8e8;
  }

  /* Scheme / server selector bar */
  body.swagger-dark .swagger-ui .scheme-container {
    background: linear-gradient(180deg, #1a1a1a 0%, #222222 100%);
    box-shadow: 0 1px 0 #383838;
  }
  body.swagger-dark .swagger-ui select {
    background: #2a2a2a;
    color: #e8e8e8;
    border-color: #383838;
  }

  /* Operation tags */
  body.swagger-dark .swagger-ui .opblock-tag {
    color: #e8e8e8;
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui .opblock-tag small {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .opblock-tag:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  /* Operation blocks */
  body.swagger-dark .swagger-ui .opblock {
    background: linear-gradient(180deg, #161616 0%, #1e1e1e 100%);
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui .opblock .opblock-summary {
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui .opblock .opblock-summary-description,
  body.swagger-dark .swagger-ui .opblock .opblock-summary-operation-id {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .opblock-body {
    background: #0f0f0f;
  }
  body.swagger-dark .swagger-ui .opblock-description-wrapper p,
  body.swagger-dark .swagger-ui .opblock-external-docs-wrapper p {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .opblock-section-header {
    background: linear-gradient(180deg, #1a1a1a 0%, #222222 100%);
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui .opblock-section-header h4 {
    color: #e8e8e8;
  }

  /* Models section */
  body.swagger-dark .swagger-ui section.models {
    background: linear-gradient(180deg, #161616 0%, #1e1e1e 100%);
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui section.models h4,
  body.swagger-dark .swagger-ui section.models h5 {
    color: #e8e8e8;
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui .model-container {
    background: #0f0f0f;
    border-color: #2a2a2a;
  }
  body.swagger-dark .swagger-ui .model-box {
    background: #1a1a1a;
  }
  body.swagger-dark .swagger-ui .model,
  body.swagger-dark .swagger-ui .model-title,
  body.swagger-dark .swagger-ui .model span,
  body.swagger-dark .swagger-ui .model .property {
    color: #e8e8e8;
  }
  body.swagger-dark .swagger-ui .model .property.primitive {
    color: #a8a8a8;
  }

  /* Tables */
  body.swagger-dark .swagger-ui table thead tr th {
    background: linear-gradient(180deg, #222222 0%, #2a2a2a 100%);
    color: #e8e8e8;
    border-color: #383838;
  }
  body.swagger-dark .swagger-ui table tbody tr td {
    color: #a8a8a8;
    border-color: #2a2a2a;
  }

  /* Parameters */
  body.swagger-dark .swagger-ui .parameter__name,
  body.swagger-dark .swagger-ui .parameter__type,
  body.swagger-dark .swagger-ui .parameter__in,
  body.swagger-dark .swagger-ui .parameter__extension,
  body.swagger-dark .swagger-ui .parameter__empty_value_toggle {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .parameter__name.required:after {
    color: #ff6b6b;
  }

  /* Inputs & textareas */
  body.swagger-dark .swagger-ui input[type='text'],
  body.swagger-dark .swagger-ui input[type='email'],
  body.swagger-dark .swagger-ui input[type='password'],
  body.swagger-dark .swagger-ui input[type='search'],
  body.swagger-dark .swagger-ui input[type='number'],
  body.swagger-dark .swagger-ui textarea {
    background: #2a2a2a;
    color: #e8e8e8;
    border-color: #383838;
  }

  /* Buttons */
  body.swagger-dark .swagger-ui .btn {
    color: #e8e8e8;
    border-color: #383838;
    background: #222222;
  }
  body.swagger-dark .swagger-ui .btn:hover {
    background: #2a2a2a;
  }
  body.swagger-dark .swagger-ui .btn.authorize {
    color: #49cc90;
    border-color: #49cc90;
    background: transparent;
  }
  body.swagger-dark .swagger-ui .btn.execute {
    background: linear-gradient(180deg, #333333 0%, #262626 100%);
    border-color: #484848;
    color: #e8e8e8;
  }
  body.swagger-dark .swagger-ui .btn.cancel {
    color: #ff6b6b;
    border-color: #ff6b6b;
  }

  /* Responses */
  body.swagger-dark .swagger-ui .responses-inner h4,
  body.swagger-dark .swagger-ui .responses-inner h5 {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .response-col_status {
    color: #e8e8e8;
  }
  body.swagger-dark .swagger-ui .response-col_description__inner p {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .response {
    border-color: #2a2a2a;
  }

  /* Code / highlight */
  body.swagger-dark .swagger-ui .highlight-code,
  body.swagger-dark .swagger-ui .microlight {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
  }

  /* Markdown */
  body.swagger-dark .swagger-ui .markdown p,
  body.swagger-dark .swagger-ui .markdown li,
  body.swagger-dark .swagger-ui .markdown a {
    color: #a8a8a8;
  }

  /* Tabs */
  body.swagger-dark .swagger-ui .tab li {
    color: #a8a8a8;
  }
  body.swagger-dark .swagger-ui .tab li.active {
    color: #e8e8e8;
  }

  /* Auth / modal dialog */
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux {
    background: linear-gradient(180deg, #1a1a1a 0%, #222222 100%);
    border: 1px solid #383838;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.7);
  }
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux-header {
    border-bottom: 1px solid #383838;
    background: linear-gradient(180deg, #222222 0%, #1a1a1a 100%);
  }
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux-header h3 {
    color: #e8e8e8;
  }
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux-content p,
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux-content label,
  body.swagger-dark .swagger-ui .dialog-ux .modal-ux-content h4 {
    color: #e8e8e8;
  }
  body.swagger-dark .swagger-ui .auth-container .errors {
    color: #ff6b6b;
  }

  /* Info / description */
  body.swagger-dark .swagger-ui .info .base-url,
  body.swagger-dark .swagger-ui .servers-title,
  body.swagger-dark .swagger-ui .servers > label {
    color: #a8a8a8;
  }

  /* Expand/collapse arrows */
  body.swagger-dark .swagger-ui svg.arrow path {
    fill: #a8a8a8;
  }
`;

const swaggerDarkJs = `(function () {
  function injectThemeToggle() {
    var topbarWrapper = document.querySelector('.swagger-ui .topbar-wrapper');
    if (!topbarWrapper || document.getElementById('swagger-theme-toggle')) return;

    var savedTheme = localStorage.getItem('swagger-theme') || 'light';
    if (savedTheme === 'dark') document.body.classList.add('swagger-dark');

    var btn = document.createElement('button');
    btn.id = 'swagger-theme-toggle';
    btn.className = 'swagger-theme-toggle-btn';
    btn.setAttribute('title', 'Toggle dark / light mode');
    btn.textContent = savedTheme === 'dark' ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode';

    btn.addEventListener('click', function () {
      var isDark = document.body.classList.toggle('swagger-dark');
      localStorage.setItem('swagger-theme', isDark ? 'dark' : 'light');
      btn.textContent = isDark ? '\u2600\uFE0F Light Mode' : '\uD83C\uDF19 Dark Mode';
    });

    topbarWrapper.appendChild(btn);
  }

  var poll = setInterval(function () {
    if (document.querySelector('.swagger-ui .topbar-wrapper')) {
      injectThemeToggle();
      clearInterval(poll);
    }
  }, 100);
})();`;

SrrComponent = () => ({ css: swaggerDarkCss, js: swaggerDarkJs });
