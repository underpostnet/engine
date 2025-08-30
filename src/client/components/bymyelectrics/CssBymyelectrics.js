import { s } from '../core/VanillaJs.js';

const CssBymyelectricsDark = {
  theme: 'bymyelectrics-dark',
  themePair: 'bymyelectrics-light',
  dark: true,
  render: async () => {
    setTimeout(() => {
      if (s('.bme-bar-logo')) s('.bme-bar-logo').classList.add('negative-color');
    });

    return html`
      <style>
        .landing-container {
          color: white;
        }
        .slide-menu-top-bar-fix {
          background-color: black;
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
    setTimeout(() => {
      if (s('.bme-bar-logo')) s('.bme-bar-logo').classList.remove('negative-color');
    });

    return html`<style>
      .landing-container {
        color: black;
      }
    </style>`;
  },
};

export { CssBymyelectricsDark, CssBymyelectricsLight };
