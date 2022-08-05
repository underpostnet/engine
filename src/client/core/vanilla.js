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

const setURI = (uri, objData, title) =>
    history.pushState(objData, title, uri)

const getURI = () => {
    const uri = location.pathname.slice(-1) == '/' ?
        location.pathname.slice(0, -1) : location.pathname;
    if (uri == '') return '/';
    return uri;
};

const serviceRequest = (url, options) => new Promise(
    (resolve, reject) => {
        fetch(url(), options)
            .then(async (res) => {
                let raw = await res.clone();
                raw = await raw.text();
                console.log(`${url()} raw: `, raw);
                return { ...await res.json(), codeStatus: res.status, raw };
            })
            .then((res) => {
                console.log('fetch success', url(), res);
                resolve(res);
            }).catch(error => {
                console.error('fetch error ', url(), error);
                reject(error);
            });
    }
);

const renderFixModal = options => {
    setTimeout(() => fadeIn(s('.' + options.id)));
    setTimeout(() => s('.' + options.id).remove(), 2500);
    return /*html*/`
    <style>
        .${options.id} {
            width: 200px;
            height: 120px;
            display: none;
            color: ${options.color};
            z-index: 9999;
            font-weight: bold;                                        
        }
    </style>
    <mini-modal class='fix center ${options.id}'>
        <div class='abs center'>
            <span style='font-size: 35px'> ${options.icon} </span> 
            <br> <br>
            ${options.content}
        </div>
    </mini-modal>
                    
`
};

const GLOBAL = this;