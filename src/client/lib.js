// vanilla-js thin layer

// install VS Code 'es6-string-html' extension 

const s = el => document.querySelector(el);
const htmls = (el, html) => s(el).innerHTML = html;
const append = (el, html) => s(el).insertAdjacentHTML('beforeend', html);
const prepend = (el, html) => s(el).insertAdjacentHTML('afterbegin', html);
const fadeIn = (el, display) => {
    el.style.opacity = 0;
    el.style.display = display || 'block';
    const fade = () => {
        let val = parseFloat(el.style.opacity);
        if (!((val += .1) > 1)) {
            el.style.opacity = val;
            requestAnimationFrame(fade);
        }
    };
    fade();
};

const borderChar = (px, color) => /*html*/`
text-shadow: ${px}px -${px}px ${px}px ${color},
                         -${px}px ${px}px ${px}px ${color},
                         -${px}px -${px}px ${px}px ${color},
                         ${px}px ${px}px ${px}px ${color};
`;

const renderLang = langs => {
    if (langs[s('html').lang]) return langs[s('html').lang];
    return langs['en'];
};
// s('html').lang = 'en';

const renderSpinner = (IDS) => /*html*/`
<div class='in ${IDS}' style='text-align: center; display: none;'>
    <div class='lds-ellipsis'><div></div><div></div><div></div><div></div></div>
</div>
`;

const renderTable = (data, options) => data[0] ? /*html*/`
        <table>
            <tr> ${Object.keys(data[0]).map(key =>/*html*/`<th class='header-table'>${key}</th>`).join('')} ${options && options.actions ? '<th></th>' : ''}</tr>
            ${data.map(row => '<tr>' + Object.keys(data[0]).map(key =>/*html*/`<th>${row[key]}</th>`).join('')
    + (options && options.actions ? options.actions(row) : '') + '</tr>').join('')}
        </table>            
    `: '';

const copyData = data => new Promise((resolve, reject) =>
    navigator.clipboard.writeText(data).then(
        () => resolve(true),
        () => reject(false)
    )
);

const pasteData = () => new Promise(resolve =>
    navigator.clipboard.readText().then(
        clipText => resolve(clipText)
    ));

const renderMediaQuery = mediaData => {
    return /*html*/`
    <style>
        ${mediaData.map(mediaState => /*css*/`
                @media only screen and (min-width: ${mediaState.limit}px) {
                    ${mediaState.css}
                }
        `).join('')}
    </style>    
    `
};
const random = (max, min) => Math.floor(Math.random() * (max - min + 1)) + min;

const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16);

const setURI = (uri, objData, title) =>
    history.pushState(objData, title, uri)

const getURI = () => {
    const uri = location.pathname.slice(-1) == '/' ?
        location.pathname.slice(0, -1) : location.pathname;
    if (uri == '') return '/';
    return uri;
};

const GLOBAL = this;