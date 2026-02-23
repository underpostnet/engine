/**
 * Vanilla JavaScript module for manipulating the DOM.
 * @module src/client/components/core/VanillaJs.js
 * @namespace VanillaJS
 */

import { s4 } from './CommonJs.js';
import { windowGetH, windowGetW } from './windowGetDimensions.js';

/**
 * Query selector.
 *
 * @param {string} el The query selector.
 * @returns {Element} Document object element.
 * @memberof VanillaJS
 */
const s = (el) => document.querySelector(el);

/**
 * The function `htmls` takes an element and HTML content as arguments and sets the inner HTML of the
 * element to the provided content.
 * @param el - The `el` parameter in the `htmls` function represents the element in the HTML document
 * that you want to update with the new HTML content.
 * @param html - The `html` parameter in the `htmls` function is the HTML content that you want to set
 * inside the specified element.
 * @memberof VanillaJS
 */
const htmls = (el, html) => (s(el).innerHTML = html);
/**
 * The `append` function inserts HTML content at the end of a specified element.
 * @param el - The `el` parameter in the `append` function represents the element to which you want to
 * append the HTML content.
 * @param html - The `html` parameter in the `append` function represents the HTML content that you
 * want to insert into the specified element. This content will be added to the end of the element's
 * existing content.
 * @memberof VanillaJS
 */
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
/**
 * The `prepend` function inserts the specified HTML content at the beginning of the selected element.
 * @param el - The `el` parameter in the `prepend` function is the element to which the HTML content
 * will be prepended.
 * @param html - The `html` parameter in the `prepend` function represents the HTML content that you
 * want to insert at the beginning of the specified element.
 * @memberof VanillaJS
 */
const prepend = (el, html) => s(el).insertAdjacentHTML('afterbegin', html);
/**
 * The function `sa` takes a CSS selector as an argument and returns a NodeList of elements that match
 * the selector.
 * @param el - The `el` parameter in the `sa` function is a string representing a CSS selector. This
 * selector is used to query the document and select all elements that match the specified selector.
 * @memberof VanillaJS
 */
const sa = (el) => document.querySelectorAll(el); // .forEach((currentValue, currentIndex, listObj)

// s(el).classList.remove(targetClass);
// s(el).classList.add(targetClass);
// s(el).classList.value;
// Array.from(s(el).classList);
// document.createElement('div');
// button.setAttribute("disabled", "");
// button.removeAttribute("disabled")

// &nbsp

// sa('[data-example]');
// <div data-example ></div>

// s(input).onblur = inputCheckFunction;
// s(input).oninput = inputCheckFunction;
// s(input).onfocus = inputCheckFunction;
// s(input).focus();

// s(`form`).onsubmit = (e) => {
//   e.preventDefault();
// };

// s(el).onmouseover = () => null;
// s(el).onmouseout = () => null;
// `0`.repeat(3) -> 000

// s(`.${idModal}`).offsetWidth
// s(`.${idModal}`).offsetHeight

// get css style tag data definitions
// window.getComputedStyle(el).color;

/**
 * The `copyData` function uses the Clipboard API to copy the provided data to the clipboard and
 * returns a promise that resolves to true if successful or false if unsuccessful.
 * @param data - The `data` parameter in the `copyData` function represents the text data that you want
 * to copy to the clipboard.
 * @memberof VanillaJS
 */
const copyData = (data) =>
  new Promise((resolve, reject) =>
    navigator.clipboard.writeText(data).then(
      () => resolve(true),
      () => reject(false),
    ),
  );

/**
 * The function `pasteData` uses the Clipboard API to read text from the clipboard and returns it as a
 * promise.
 * @memberof VanillaJS
 */
const pasteData = () => new Promise((resolve) => navigator.clipboard.readText().then((clipText) => resolve(clipText)));

/**
 * The `preHTML` function in JavaScript replaces special characters like &, <, and > with their
 * corresponding HTML entities.
 * @param raw - The `raw` parameter in the `preHTML` function represents the raw HTML content that you
 * want to sanitize by replacing special characters like `&`, `<`, and `>` with their corresponding
 * HTML entities.
 * @memberof VanillaJS
 */
const preHTML = (raw) => raw.replaceAll('&', '&amp').replaceAll('<', '&lt').replaceAll('>', '&gt');

/**
 * The function `disableOptionsClick` disables specific user interaction options like right-click menu,
 * drag, and text selection on a given HTML element.
 * @param element - The `element` parameter in the `disableOptionsClick` function refers to the HTML
 * element to which you want to disable certain user interactions like right-click context menu,
 * drag-and-drop, or text selection based on the specified types.
 * @param types - The `types` parameter in the `disableOptionsClick` function is an array that
 * specifies the types of interactions to disable on the given `element`. The possible values for
 * `types` are 'menu', 'drag', and 'select'.
 * @returns In the `disableOptionsClick` function, event handlers are being assigned to the specified
 * `element` based on the `types` array provided. The function is returning `false` for the
 * corresponding events based on the types included in the `types` array.
 * @memberof VanillaJS
 */
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

/**
 * The function `checkFullScreen` checks if the document is in full screen mode and returns a boolean
 * value accordingly. Checks all vendor-prefixed APIs for maximum compatibility.
 * @returns The function `checkFullScreen` is returning `true` if any fullscreen API indicates
 * fullscreen mode is active, otherwise it returns `false`.
 * @memberof VanillaJS
 */
const checkFullScreen = () => {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    document.fullscreen ||
    document.webkitIsFullScreen ||
    document.mozFullScreen
  );
};

/**
 * The function `fullScreenOut` is used to exit full screen mode in a web browser.
 * Handles all vendor-prefixed APIs and returns a promise for better control flow.
 * @returns {Promise<boolean>} Promise that resolves to true if exit was attempted
 * @memberof VanillaJS
 */
const fullScreenOut = () => {
  return new Promise((resolve) => {
    if (!checkFullScreen()) {
      resolve(true);
      return;
    }

    try {
      if (document.exitFullscreen) {
        document
          .exitFullscreen()
          .then(() => resolve(true))
          .catch(() => resolve(false));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
        setTimeout(() => resolve(true), 100);
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
        setTimeout(() => resolve(true), 100);
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
        setTimeout(() => resolve(true), 100);
      } else {
        resolve(false);
      }
    } catch (err) {
      console.warn('Fullscreen exit error:', err);
      resolve(false);
    }
  });
};

/**
 * The `fullScreenIn` function is used to request full screen mode in a web browser using different
 * vendor-specific methods. Returns a promise for better control flow.
 * @returns {Promise<boolean>} Promise that resolves to true if fullscreen was requested
 * @memberof VanillaJS
 */
const fullScreenIn = () => {
  return new Promise((resolve) => {
    if (checkFullScreen()) {
      resolve(true);
      return;
    }

    const elem = document.documentElement;

    try {
      if (elem.requestFullscreen) {
        elem
          .requestFullscreen()
          .then(() => resolve(true))
          .catch(() => resolve(false));
      } else if (elem.webkitRequestFullscreen) {
        /* Chrome, Safari & Opera */
        elem.webkitRequestFullscreen();
        setTimeout(() => resolve(true), 100);
      } else if (elem.mozRequestFullScreen) {
        /* Firefox */
        elem.mozRequestFullScreen();
        setTimeout(() => resolve(true), 100);
      } else if (elem.msRequestFullscreen) {
        /* IE/Edge */
        const msElem = window.top.document.body;
        msElem.msRequestFullscreen();
        setTimeout(() => resolve(true), 100);
      } else {
        resolve(false);
      }
    } catch (err) {
      console.warn('Fullscreen request error:', err);
      resolve(false);
    }
  });
};

/**
 * The function `getResponsiveData` returns an object containing the width, height, minimum value,
 * maximum value, and corresponding types based on the window dimensions.
 * @returns The `getResponsiveData` function returns an object that contains the width and height of
 * the window, along with additional properties based on whether the width is greater than the height
 * or not. If the width is greater than the height, the returned object includes the width, height,
 * minValue (height), maxValue (width), minType ('height'), and maxType ('width'). If the height is
 * greater than
 * @memberof VanillaJS
 */
const getResponsiveData = () => {
  const inner = { width: windowGetW(), height: windowGetH() };
  return inner.width > inner.height
    ? { ...inner, minValue: windowGetH(), maxValue: windowGetW(), minType: 'height', maxType: 'width' }
    : { ...inner, minValue: windowGetW(), maxValue: windowGetH(), minType: 'width', maxType: 'height' };
};

/**
 * The function `isElement` checks if a given object is an instance of `Element` or `HTMLDocument`.
 * @param element - The `element` parameter is a variable that represents an HTML element or an HTML
 * document. The `isElement` function checks if the provided `element` is an instance of the `Element`
 * interface or the `HTMLDocument` interface.
 * @memberof VanillaJS
 */
const isElement = (element) => element instanceof Element || element instanceof HTMLDocument;

/**
 * Download File.
 *
 * @param {File | Blob} fileInstance The file or blob object.
 * @param {string} fileName The file name with extension.
 * @returns {void} void.
 * @memberof VanillaJS
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

/**
 * The function `getRawContentFile` reads the raw content of a file using a FileReader in JavaScript.
 * @param blob - The `blob` parameter in the `getRawContentFile` function is a Buffer object that
 * represents raw binary data. It is used to read the content of a file as text using a FileReader in
 * the browser environment.
 * @memberof VanillaJS
 */
const getRawContentFile = (blob = new Buffer()) =>
  new Promise((resolve) => {
    {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    }
  });

/**
 * The function `getBlobFromUint8ArrayFile` creates a Blob object from a Uint8Array file data with a
 * specified mimetype.
 * @param data - The `data` parameter in the `getBlobFromUint8ArrayFile` function is an array of
 * arrays containing Uint8Array data.
 * @param mimetype - The `mimetype` parameter in the
 * `getBlobFromUint8ArrayFile` function is a string that specifies the type of the Blob object being
 * created. It indicates the MIME type of the data contained in the Blob. For example, common MIME
 * types include 'image/jpeg' for JPEG images,
 * @returns A Blob object is being returned, created from the provided Uint8Array data and mimetype.
 * @memberof VanillaJS
 */
const getBlobFromUint8ArrayFile = (data = [[]], mimetype = 'application/octet-stream') => {
  return new Blob([new Uint8Array(data)], { type: mimetype });
};

/**
 * The function `isNavigator` checks if the user agent string contains a specified name.
 * @param name - The `name` parameter is a string that represents the name of a browser or device to
 * check against the user agent string of the browser.
 * @memberof VanillaJS
 */
const isNavigator = (name) => navigator.userAgent.toLowerCase().match(name.toLowerCase());

/**
 * The function `getTimeZone` returns the current time zone based on the user's browser settings.
 * @memberof VanillaJS
 */
const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The function `getAllChildNodes` recursively retrieves all child nodes of a given parent node in a
 * tree-like structure.
 * @param node - The `node` parameter in the `getAllChildNodes` function is the starting node from
 * which you want to retrieve all child nodes recursively.
 * @returns The `getAllChildNodes` function returns an array containing all the child nodes of the
 * input `node`, including nested child nodes.
 * @memberof VanillaJS
 */
function getAllChildNodes(node) {
  const allNodes = [];

  function traverse(node) {
    if (node.childNodes.length === 0) {
      return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      allNodes.push(child);
      traverse(child);
    }
  }

  traverse(node);
  return allNodes;
}

/**
 * The function `isActiveTab` checks if the document has focus.
 * @memberof VanillaJS
 */
const isActiveTab = () => document.hasFocus();

/**
 * The function `isActiveElement` checks if the active element in the document matches a specified
 * class search.
 * @param classSearch - The `classSearch` parameter is a string that is used to search for a specific
 * class name within the `classList` of the active element in the document.
 * @memberof VanillaJS
 */
const isActiveElement = (classSearch = '') =>
  document.activeElement?.classList?.value?.match(classSearch) ? true : false;

const isDevInstance = () => location.origin.match('localhost') && location.port;

const getDataFromInputFile = async (file) => Array.from(new Uint8Array(await file.arrayBuffer()));

const getLang = () =>
  (localStorage.getItem('lang') || navigator.language || navigator.userLanguage || s('html').lang)
    .slice(0, 2)
    .toLowerCase();

function hexToRgbA(hex) {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length == 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  }
  throw new Error('Invalid Hex');
}

const htmlStrSanitize = (str) => (str ? str.replace(/<\/?[^>]+(>|$)/g, '').trim() : '');

/**
 * Query selector inside an iframe. Allows obtaining a single element that is
 * inside an iframe in order to execute events on it.
 * Note: the iframe must be same-origin for this to work.
 *
 * @param {string|Element} iframeEl The CSS selector string or the iframe Element itself.
 * @param {string} el The query selector for the element inside the iframe.
 * @returns {Element|null} The matched element inside the iframe, or null if not found.
 * @memberof VanillaJS
 */
const sIframe = (iframeEl, el) => {
  const iframe = typeof iframeEl === 'string' ? s(iframeEl) : iframeEl;
  if (!iframe) return null;
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  return iframeDoc ? iframeDoc.querySelector(el) : null;
};

/**
 * Query selector all inside an iframe. Allows obtaining all elements matching a
 * selector that are inside an iframe in order to execute events on them.
 * Note: the iframe must be same-origin for this to work.
 *
 * @param {string|Element} iframeEl The CSS selector string or the iframe Element itself.
 * @param {string} el The query selector for the elements inside the iframe.
 * @returns {NodeList|null} A NodeList of matched elements inside the iframe, or null if not found.
 * @memberof VanillaJS
 */
const saIframe = (iframeEl, el) => {
  const iframe = typeof iframeEl === 'string' ? s(iframeEl) : iframeEl;
  if (!iframe) return null;
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  return iframeDoc ? iframeDoc.querySelectorAll(el) : null;
};

export {
  s,
  htmls,
  append,
  prepend,
  sa,
  sIframe,
  saIframe,
  copyData,
  pasteData,
  preHTML,
  disableOptionsClick,
  checkFullScreen,
  fullScreenOut,
  fullScreenIn,
  getResponsiveData,
  isElement,
  downloadFile,
  getRawContentFile,
  getBlobFromUint8ArrayFile,
  isNavigator,
  getTimeZone,
  getAllChildNodes,
  isActiveTab,
  isActiveElement,
  isDevInstance,
  getDataFromInputFile,
  getLang,
  hexToRgbA,
  htmlStrSanitize,
};
