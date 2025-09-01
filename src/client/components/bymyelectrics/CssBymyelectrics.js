import { s } from '../core/VanillaJs.js';

const CssBymyelectricsDark = {
  theme: 'bymyelectrics-dark',
  themePair: 'bymyelectrics-light',
  dark: true,
  render: async () => {
    return html`
      <style>
        .landing-container {
          color: white;
        }
        .slide-menu-top-bar-fix {
          background-color: black;
        }
        footer {
          background: #22211a;
        }
        .sub-title-sec-1 {
          color: #fff688;
        }
      </style>
    `;
  },
};

const CssBymyelectricsLight = {
  theme: 'bymyelectrics-light',
  themePair: 'bymyelectrics-dark',
  dark: false,
  render: async () => {
    return html`<style>
      .landing-container {
        color: black;
      }
      .sub-title-sec-1 {
        color: #2f5596;
      }
      footer {
        background: #2f5596;
      }
    </style>`;
  },
};

export { CssBymyelectricsDark, CssBymyelectricsLight };
