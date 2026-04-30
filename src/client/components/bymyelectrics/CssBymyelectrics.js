import { s } from '../core/VanillaJs.js';

class CssBymyelectricsDark {
  static theme = 'bymyelectrics-dark';
  static themePair = 'bymyelectrics-light';
  static dark = true;
  static render = async () => {
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
  };
}

class CssBymyelectricsLight {
  static theme = 'bymyelectrics-light';
  static themePair = 'bymyelectrics-dark';
  static dark = false;
  static render = async () => {
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
  };
}

export { CssBymyelectricsDark, CssBymyelectricsLight };
