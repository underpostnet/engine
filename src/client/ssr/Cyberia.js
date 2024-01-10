ViewRender = (data) => html`
  <!DOCTYPE html>
  <html dir="ltr" lang="en">
    <head>
      <title>CYBERIA - ${data.title}</title>
      <link rel="icon" type="image/x-icon" href="${data.path !== '/' ? `${data.path}/` : '/'}favicon.ico" />
      <meta charset="UTF-8" />
      <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
    </head>
    <body>
      <div class="loading-background" style="opacity: 1">
        <style>
          .loading-background {
            --s: 100px; /* control the size */
            --c1: #1c1c1c;
            --c2: #090909;

            --_s: calc(2 * var(--s)) calc(2 * var(--s));
            --_g: var(--_s) conic-gradient(at 40% 40%, #0000 75%, var(--c1) 0);
            --_p: var(--_s) conic-gradient(at 20% 20%, #0000 75%, var(--c2) 0);
            background: calc(0.9 * var(--s)) calc(0.9 * var(--s)) / var(--_p),
              calc(-0.1 * var(--s)) calc(-0.1 * var(--s)) / var(--_p),
              calc(0.7 * var(--s)) calc(0.7 * var(--s)) / var(--_g),
              calc(-0.3 * var(--s)) calc(-0.3 * var(--s)) / var(--_g),
              conic-gradient(from 90deg at 20% 20%, var(--c2) 25%, var(--c1) 0) 0 0 / var(--s) var(--s);
            animation: m 3s infinite;
          }
          @keyframes m {
            0% {
              background-position: calc(0.9 * var(--s)) calc(0.9 * var(--s)),
                calc(-0.1 * var(--s)) calc(-0.1 * var(--s)), calc(0.7 * var(--s)) calc(0.7 * var(--s)),
                calc(-0.3 * var(--s)) calc(-0.3 * var(--s)), 0 0;
            }
            25% {
              background-position: calc(1.9 * var(--s)) calc(0.9 * var(--s)),
                calc(-1.1 * var(--s)) calc(-0.1 * var(--s)), calc(1.7 * var(--s)) calc(0.7 * var(--s)),
                calc(-1.3 * var(--s)) calc(-0.3 * var(--s)), 0 0;
            }
            50% {
              background-position: calc(1.9 * var(--s)) calc(-0.1 * var(--s)),
                calc(-1.1 * var(--s)) calc(0.9 * var(--s)), calc(1.7 * var(--s)) calc(-0.3 * var(--s)),
                calc(-1.3 * var(--s)) calc(0.7 * var(--s)), 0 0;
            }
            75% {
              background-position: calc(2.9 * var(--s)) calc(-0.1 * var(--s)),
                calc(-2.1 * var(--s)) calc(0.9 * var(--s)), calc(2.7 * var(--s)) calc(-0.3 * var(--s)),
                calc(-2.3 * var(--s)) calc(0.7 * var(--s)), 0 0;
            }
            100% {
              background-position: calc(2.9 * var(--s)) calc(-1.1 * var(--s)),
                calc(-2.1 * var(--s)) calc(1.9 * var(--s)), calc(2.7 * var(--s)) calc(-1.3 * var(--s)),
                calc(-2.3 * var(--s)) calc(1.7 * var(--s)), 0 0;
            }
          }
        </style>
        <style>
          html,
          body {
            padding: 0;
            margin: 0;
          }
          .loading-background {
            position: absolute;
            display: block;
            /* background: #1a1a1a; */
            color: #ffcc00;
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
            z-index: 10;
            transition: 0.3s;
            font-size: 20px;
            font-weight: bold;
            font-family: monospace;
          }
          .loading-center {
            position: absolute;
            display: block;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100%;
            text-align: center;
          }
        </style>
        <style></style>
        <div class="loading-center">Loading...</div>
      </div>

      <script async type="module" src="./${data.buildId}.js"></script>
    </body>
  </html>
`;
