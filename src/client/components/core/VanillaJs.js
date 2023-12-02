// vanilla-js thin layer

import { s4 } from './CommonJs.js';

/*

Name: es6-string-html
Id: Tobermory.es6-string-html
Description: Syntax highlighting in es6 multiline strings
Version: 2.12.1
Publisher: Tobermory
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html

Name: es6-string-css
Id: bashmish.es6-string-css
Description: Highlight CSS language in ES6 template literals
Version: 0.1.0
Publisher: Mikhail Bashkirov
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=bashmish.es6-string-css

Name: lit-html
Id: bierner.lit-html
Description: Syntax highlighting and IntelliSense for html inside of JavaScript and TypeScript tagged template strings
Version: 1.11.1
Publisher: Matt Bierner
VS Marketplace Link: https://marketplace.visualstudio.com/items?itemName=bierner.lit-html

*/

/**
 * Query selector.
 *
 * @param {string} el The query selector.
 * @returns {Element} Document object element.
 */
const s = (el) => document.querySelector(el);

const htmls = (el, html) => (s(el).innerHTML = html);
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
const prepend = (el, html) => s(el).insertAdjacentHTML('afterbegin', html);
const sa = (el) => document.querySelectorAll(el); // .forEach((currentValue, currentIndex, listObj)

// s(el).classList.remove(targetClass);
// s(el).classList.add(targetClass);
// s(el).classList.value;
// Array.from(s(el).classList);

// sa('[data-example]');
// <div data-example ></div>

// s(input).onblur = inputCheckFunction;
// s(input).oninput = inputCheckFunction;

// s(el).onmouseover = () => null;
// s(el).onmouseout = () => null;

const copyData = (data) =>
  new Promise((resolve, reject) =>
    navigator.clipboard.writeText(data).then(
      () => resolve(true),
      () => reject(false),
    ),
  );

const pasteData = () => new Promise((resolve) => navigator.clipboard.readText().then((clipText) => resolve(clipText)));

const setURI = (uri, objData, title) => history.pushState(objData, title, uri);

const getURI = () => location.pathname;

const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  let queries = {};
  for (const param of params) {
    queries[param[0]] = param[1];
  }
  return queries;
};

const preHTML = (raw) => raw.replaceAll('&', '&amp').replaceAll('<', '&lt').replaceAll('>', '&gt');

const disableOptionsClick = (element, types) => {
  if (types.includes('menu'))
    s(element).oncontextmenu = function () {
      return false;
    };
  if (types.includes('drag'))
    s(element).ondragstart = function () {
      return false;
    };
  if (types.includes('select'))
    s(element).onselectstart = function () {
      return false;
    };
};

const checkFullScreen = () => {
  return !(!window.screenTop && !window.screenY) || document.fullscreenElement ? true : false;
};

const fullScreenOut = () => {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    window.top.document.msExitFullscreen();
  }
};

const fullScreenIn = () => {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    /* Chrome, Safari & Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    /* IE/Edge */
    elem = window.top.document.body; //To break out of frame in IE
    elem.msRequestFullscreen();
  }
};

const getResponsiveData = () => {
  const inner = { width: window.innerWidth, height: window.innerHeight };
  return inner.width > inner.height
    ? { ...inner, minValue: window.innerHeight, maxValue: window.innerWidth, minType: 'height', maxType: 'width' }
    : { ...inner, minValue: window.innerWidth, maxValue: window.innerHeight, minType: 'width', maxType: 'height' };
};

const isElement = (element) => element instanceof Element || element instanceof HTMLDocument;

/**
 * Query selector.
 *
 * @param {File | Blob} fileInstance The file or blob object.
 * @param {string} fileName The file name with extension.
 * @returns {void} void.
 */
function downloadFile(fileInstance, fileName) {
  // const blob = new Blob([raw], { type: 'image/png' })
  // const file = new File([blob], { type: 'image/png' }); // open window save name
  // downloadFile(blob | file, `${name}.png`);

  // Create a URL for the file
  const url = URL.createObjectURL(fileInstance);

  // Create an anchor element
  const idDownload = 'downloader-' + s4() + s4();
  append('body', html`<a class="${idDownload}" style="display: none"></a>`);

  // Exec download
  s(`.${idDownload}`).href = url;
  s(`.${idDownload}`).download = fileName;
  s(`.${idDownload}`).click();
  s(`.${idDownload}`).remove();

  // Revoke the URL object to free up resources
  return URL.revokeObjectURL(url);
}

const getProxyPath = () => (location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}/` : '/');

export {
  s,
  htmls,
  append,
  prepend,
  sa,
  copyData,
  pasteData,
  setURI,
  getURI,
  getQueryParams,
  preHTML,
  disableOptionsClick,
  checkFullScreen,
  fullScreenOut,
  fullScreenIn,
  getResponsiveData,
  isElement,
  downloadFile,
  getProxyPath,
};
