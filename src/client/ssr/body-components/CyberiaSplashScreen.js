SrrComponent = () => html` <div class="ssr-background" style="opacity: 1">
  <style>
    .ssr-background {
      --s: 100px; /* control the size */
      --c1: #1c1c1c;
      --c2: #090909;

      --_s: calc(2 * var(--s)) calc(2 * var(--s));
      --_g: var(--_s) conic-gradient(at 40% 40%, #0000 75%, var(--c1) 0);
      --_p: var(--_s) conic-gradient(at 20% 20%, #0000 75%, var(--c2) 0);
      background: calc(0.9 * var(--s)) calc(0.9 * var(--s)) / var(--_p),
        calc(-0.1 * var(--s)) calc(-0.1 * var(--s)) / var(--_p), calc(0.7 * var(--s)) calc(0.7 * var(--s)) / var(--_g),
        calc(-0.3 * var(--s)) calc(-0.3 * var(--s)) / var(--_g),
        conic-gradient(from 90deg at 20% 20%, var(--c2) 25%, var(--c1) 0) 0 0 / var(--s) var(--s);
      animation: m 3s infinite;
    }
    @keyframes m {
      0% {
        background-position: calc(0.9 * var(--s)) calc(0.9 * var(--s)), calc(-0.1 * var(--s)) calc(-0.1 * var(--s)),
          calc(0.7 * var(--s)) calc(0.7 * var(--s)), calc(-0.3 * var(--s)) calc(-0.3 * var(--s)), 0 0;
      }
      25% {
        background-position: calc(1.9 * var(--s)) calc(0.9 * var(--s)), calc(-1.1 * var(--s)) calc(-0.1 * var(--s)),
          calc(1.7 * var(--s)) calc(0.7 * var(--s)), calc(-1.3 * var(--s)) calc(-0.3 * var(--s)), 0 0;
      }
      50% {
        background-position: calc(1.9 * var(--s)) calc(-0.1 * var(--s)), calc(-1.1 * var(--s)) calc(0.9 * var(--s)),
          calc(1.7 * var(--s)) calc(-0.3 * var(--s)), calc(-1.3 * var(--s)) calc(0.7 * var(--s)), 0 0;
      }
      75% {
        background-position: calc(2.9 * var(--s)) calc(-0.1 * var(--s)), calc(-2.1 * var(--s)) calc(0.9 * var(--s)),
          calc(2.7 * var(--s)) calc(-0.3 * var(--s)), calc(-2.3 * var(--s)) calc(0.7 * var(--s)), 0 0;
      }
      100% {
        background-position: calc(2.9 * var(--s)) calc(-1.1 * var(--s)), calc(-2.1 * var(--s)) calc(1.9 * var(--s)),
          calc(2.7 * var(--s)) calc(-1.3 * var(--s)), calc(-2.3 * var(--s)) calc(1.7 * var(--s)), 0 0;
      }
    }
  </style>
  <style>
    .ssr-background {
      position: absolute;
      display: block;
      /* background: #1a1a1a; */
      color: #ffcc00;
      width: 100%;
      height: 100%;
      padding: 0;
      margin: 0;
      top: 0px;
      left: 0px;
      z-index: 10;
      transition: 0.3s;
      font-size: 20px;
      font-weight: bold;
      font-family: monospace;
    }
    .ssr-body {
      /* background: rgba(0, 0, 0, 0.5); */
      position: absolute;
      display: block;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      font-size: 20px;
    }
    .ssr-logo-cyberia {
      position: relative;
      display: inline-table;
      width: 130px;
      height: 130px;
    }
  </style>
  <div class="ssr-body">
    <img
      class="ssr-logo-cyberia"
      alt="CYBERIA ONLINE"
      src="data:image/png;base64,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"
    />
  </div>
</div>`;
