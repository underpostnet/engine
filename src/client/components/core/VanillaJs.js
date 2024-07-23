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

// Docs by https://mintlify.com

/**
 * Query selector.
 *
 * @param {string} el The query selector.
 * @returns {Element} Document object element.
 */
const s = (el) => document.querySelector(el);

/**
 * The function `htmls` takes an element and HTML content as arguments and sets the inner HTML of the
 * element to the provided content.
 * @param el - The `el` parameter in the `htmls` function represents the element in the HTML document
 * that you want to update with the new HTML content.
 * @param html - The `html` parameter in the `htmls` function is the HTML content that you want to set
 * inside the specified element.
 */
const htmls = (el, html) => (s(el).innerHTML = html);
/**
 * The `append` function inserts HTML content at the end of a specified element.
 * @param el - The `el` parameter in the `append` function represents the element to which you want to
 * append the HTML content.
 * @param html - The `html` parameter in the `append` function represents the HTML content that you
 * want to insert into the specified element. This content will be added to the end of the element's
 * existing content.
 */
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
/**
 * The `prepend` function inserts the specified HTML content at the beginning of the selected element.
 * @param el - The `el` parameter in the `prepend` function is the element to which the HTML content
 * will be prepended.
 * @param html - The `html` parameter in the `prepend` function represents the HTML content that you
 * want to insert at the beginning of the specified element.
 */
const prepend = (el, html) => s(el).insertAdjacentHTML('afterbegin', html);
/**
 * The function `sa` takes a CSS selector as an argument and returns a NodeList of elements that match
 * the selector.
 * @param el - The `el` parameter in the `sa` function is a string representing a CSS selector. This
 * selector is used to query the document and select all elements that match the specified selector.
 */
const sa = (el) => document.querySelectorAll(el); // .forEach((currentValue, currentIndex, listObj)

// s(el).classList.remove(targetClass);
// s(el).classList.add(targetClass);
// s(el).classList.value;
// Array.from(s(el).classList);
// document.createElement('div');

// &nbsp

// sa('[data-example]');
// <div data-example ></div>

// s(input).onblur = inputCheckFunction;
// s(input).oninput = inputCheckFunction;
// s(input).onfocus = inputCheckFunction;
// s(input).focus();

// s(el).onmouseover = () => null;
// s(el).onmouseout = () => null;
// `0`.repeat(3) -> 000

// s(`.${idModal}`).offsetWidth
// s(`.${idModal}`).offsetHeight

/**
 * The `copyData` function uses the Clipboard API to copy the provided data to the clipboard and
 * returns a promise that resolves to true if successful or false if unsuccessful.
 * @param data - The `data` parameter in the `copyData` function represents the text data that you want
 * to copy to the clipboard.
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
 */
const pasteData = () => new Promise((resolve) => navigator.clipboard.readText().then((clipText) => resolve(clipText)));

/**
 * The setPath function updates the browser's history with a new URI, object data, and title.
 * @param uri - The `uri` parameter is the new URI (Uniform Resource Identifier) that you want to set
 * for the browser's history. It represents the new location that you want to navigate to within the
 * same page without a full page reload.
 * @param objData - The `objData` parameter is an object that represents the state data associated with
 * the specified URI. It can include any relevant information that you want to store and associate with
 * the URI for later use. This data will be accessible through the `history.state` property after the
 * URI is updated using `history
 * @param title - The `title` parameter in the `setPath` function is a string that represents the title
 * of the new history entry. This title will be displayed in the browser's history and can help users
 * identify the page when they navigate through their history.
 */
const setPath = (uri, objData, title) => history.pushState(objData, title, uri);

/**
 * The function `getQueryParams` extracts query parameters from the current URL and returns them as an
 * object.
 * @returns An object containing the query parameters from the current URL is being returned.
 */
const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  let queries = {};
  for (const param of params) {
    queries[param[0]] = param[1];
  }
  return queries;
};

/**
 * The `preHTML` function in JavaScript replaces special characters like &, <, and > with their
 * corresponding HTML entities.
 * @param raw - The `raw` parameter in the `preHTML` function represents the raw HTML content that you
 * want to sanitize by replacing special characters like `&`, `<`, and `>` with their corresponding
 * HTML entities.
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
 * value accordingly.
 * @returns The function `checkFullScreen` is returning `true` if `document.fullscreenElement` is
 * truthy, otherwise it returns `false`.
 */
const checkFullScreen = () => {
  // !(!window.screenTop && !window.screenY) ||
  return document.fullscreenElement ? true : false;
};

/**
 * The function `fullScreenOut` is used to exit full screen mode in a web browser.
 */
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

/**
 * The `fullScreenIn` function is used to request full screen mode in a web browser using different
 * vendor-specific methods.
 */
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

/**
 * The function `getResponsiveData` returns an object containing the width, height, minimum value,
 * maximum value, and corresponding types based on the window dimensions.
 * @returns The `getResponsiveData` function returns an object that contains the width and height of
 * the window, along with additional properties based on whether the width is greater than the height
 * or not. If the width is greater than the height, the returned object includes the width, height,
 * minValue (height), maxValue (width), minType ('height'), and maxType ('width'). If the height is
 * greater than
 */
const getResponsiveData = () => {
  const inner = { width: window.innerWidth, height: window.innerHeight };
  return inner.width > inner.height
    ? { ...inner, minValue: window.innerHeight, maxValue: window.innerWidth, minType: 'height', maxType: 'width' }
    : { ...inner, minValue: window.innerWidth, maxValue: window.innerHeight, minType: 'width', maxType: 'height' };
};

/**
 * The function `isElement` checks if a given object is an instance of `Element` or `HTMLDocument`.
 * @param element - The `element` parameter is a variable that represents an HTML element or an HTML
 * document. The `isElement` function checks if the provided `element` is an instance of the `Element`
 * interface or the `HTMLDocument` interface.
 */
const isElement = (element) => element instanceof Element || element instanceof HTMLDocument;

/**
 * Download File.
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

/**
 * The function `getRawContentFile` reads the raw content of a file using a FileReader in JavaScript.
 * @param [blob] - The `blob` parameter in the `getRawContentFile` function is a Buffer object that
 * represents raw binary data. It is used to read the content of a file as text using a FileReader in
 * the browser environment.
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
 * The function `getBlobFromUint8ArrayFile` creates a Blob object from JSON data.
 * @param json - The `json` parameter in the `getBlobFromUint8ArrayFile` function is an object that contains
 * two properties:
 * @returns A Blob object is being returned, created from the data and mimetype properties of the input
 * JSON object.
 */
const getBlobFromUint8ArrayFile = (json) => {
  return new Blob([new Uint8Array(json.data.data)], { type: json.mimetype });
};

// Router
/**
 * The function `getProxyPath` returns a proxy path based on the current location pathname.
 * @returns The `getProxyPath` function returns the path based on the current location. If the first
 * segment of the pathname is not empty, it returns `/<first-segment>/`, otherwise it returns `/`. If
 * the `window.Routes` object exists and the path is not `/` and the path without the trailing slash is
 * a key in the `window.Routes` object, it returns `/`.
 */
const getProxyPath = () => {
  let path = location.pathname.split('/')[1] ? `/${location.pathname.split('/')[1]}/` : '/';
  if (window.Routes && path !== '/' && path.slice(0, -1) in window.Routes()) path = '/';
  return path;
};

/**
 * The function `isNavigator` checks if the user agent string contains a specified name.
 * @param name - The `name` parameter is a string that represents the name of a browser or device to
 * check against the user agent string of the browser.
 */
const isNavigator = (name) => navigator.userAgent.toLowerCase().match(name.toLowerCase());

/**
 * The function `getTimeZone` returns the current time zone based on the user's browser settings.
 */
const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export {
  s,
  htmls,
  append,
  prepend,
  sa,
  copyData,
  pasteData,
  setPath,
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
  getRawContentFile,
  getBlobFromUint8ArrayFile,
  isNavigator,
  getTimeZone,
};
