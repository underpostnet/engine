import { newInstance, getId } from './CommonJs.js';
import { s, htmls } from './VanillaJs.js';

const Translate = {
  Token: {},
  Parse: function (lang) {
    s('html').lang = lang;
    Object.keys(this.Token).map((translateHash) => {
      if (translateHash in this.Token && lang in this.Token[translateHash]) {
        if (!('placeholder' in this.Token[translateHash]) && s(`.${translateHash}`))
          htmls(`.${translateHash}`, this.Token[translateHash][lang]);
        else if ('placeholder' in this.Token[translateHash] && s(this.Token[translateHash].placeholder))
          s(this.Token[translateHash].placeholder).placeholder = this.Token[translateHash][lang];
      }
    });
  },
  Render: function (langs) {
    const translateHash = getId(this.Token, 'trans');
    this.Token[translateHash] = newInstance(langs);
    if ('placeholder' in langs) {
      if (s('html').lang in langs) return langs[s('html').lang];
      return langs['en'];
    }
    if (s('html').lang in langs) return html`<span class="${translateHash}">${langs[s('html').lang]}</span>`;
    return html`<span class="${translateHash}">${langs['en']}</span>`;
  },
};

export { Translate };
