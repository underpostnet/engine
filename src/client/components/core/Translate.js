import { newInstance, getId } from './CommonJs.js';
import { s, htmls } from './VanillaJs.js';

const Translate = {
  Data: {},
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
  Render: function (keyLang) {
    keyLang = this.Data[keyLang];
    const translateHash = getId(this.Token, 'trans');
    this.Token[translateHash] = newInstance(keyLang);
    if ('placeholder' in keyLang) {
      if (s('html').lang in keyLang) return keyLang[s('html').lang];
      return keyLang['en'];
    }
    if (s('html').lang in keyLang) return html`<span class="${translateHash}">${keyLang[s('html').lang]}</span>`;
    return html`<span class="${translateHash}">${keyLang['en']}</span>`;
  },
};

export { Translate };
