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
const fadeOut = (el) => {
    el.style.opacity = 1;
    const fade = () => {
        if ((el.style.opacity -= .1) < 0) {
            el.style.display = 'none';
        } else {
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
<div class='in container ${IDS}' style='text-align: center; display: none;'>
    <div class='lds-ellipsis'><div></div><div></div><div></div><div></div></div>
</div>
`;

const renderTable = (data, options) => data[0] ? /*html*/`
        <table>
            <tr> ${Object.keys(data[0]).map(key =>/*html*/`<th class='header-table'>${key}</th>`).join('')} ${options && options.actions ?
        options.customHeader ? options.customHeader : '<th></th>' : ''}</tr>
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
    return uri;
};

const serviceRequest = (url, options) => new Promise(
    (resolve, reject) => {
        fetch(url(), options)
            .then(async (res) => {
                let raw = await res.clone();
                raw = await raw.text();
                console.log(`${url()} raw: `, raw);
                if (options && options.raw === true) return raw;
                let returnObj;
                try {
                    returnObj = await res.json();
                } catch (error) {
                    return raw;
                }
                return { ...returnObj, codeStatus: res.status, raw };
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
    const timeOut = options && options.time ? options.time : 2500;
    setTimeout(() => s('.' + options.id) ? fadeIn(s('.' + options.id)) : null);
    setTimeout(() => s('.' + options.id) ? fadeOut(s('.' + options.id)) : null, timeOut);
    setTimeout(() => {
        if (s('.' + options.id)) s('.' + options.id).remove();
        if (s('.style-' + options.id)) s('.style-' + options.id).remove();
    }, (timeOut + 500));
    return /*html*/`
    <style class='style-${options.id}'>
        .${options.id} {
            width: ${options.width ? options.width : '200'}px;
            height: ${options.height ? options.height : '120'}px;
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
            ${typeof options.content == 'function' ? options.content() : options.content}
        </div>
    </mini-modal>
                    
`
};

const renderToggleSwitch = options => {
    const factor = options && options.factor ? options.factor : 25;
    const wFactor = 2.3;
    const roundFactor = 0.7;
    setTimeout(() => {
        s(`.ts-container-${options.id}`).onclick = () => {
            if (s(`.${options.id}`).checked) {
                s(`.${options.id}`).checked = false;
                s(`.ts-round-${options.id}`).style.left =
                    (factor * 0.1) + 'px';
                htmls(`.ts-label-${options.id}`, options.label[0]);
                s('.ts-round-' + options.id).style.background = 'gray';
            } else {
                s(`.${options.id}`).checked = true;
                s(`.ts-round-${options.id}`).style.left =
                    ((factor * wFactor) - (factor * 0.1) - (factor * roundFactor)) + 'px';
                htmls(`.ts-label-${options.id}`, options.label[1]);
                s('.ts-round-' + options.id).style.background = 'green';
            }
            if (options && options.onChange) options.onChange(s(`.${options.id}`).checked);
        };

        if (options && options.checked == true)
            s(`.ts-container-${options.id}`).click();
    });
    return /*html*/`
    <style>
        .ts-container-${options.id} {
            width: ${factor * wFactor}px;
            height: ${factor}px;
            background: #121212;
            border-radius: ${factor * 0.1}px;
            cursor: pointer;
        }
        .ts-round-${options.id} {
            border-radius: 50%;
            height: ${factor * roundFactor}px;
            width: ${factor * roundFactor}px;
            background: gray;
            transition: .3s;
        }
        .ts-label-${options.id} {
            font-size: ${factor * 0.5}px;
            ${borderChar((factor * 0.5), 'black')};
        }
    </style>
    <input type='checkbox' class='${options.id}' style='display: none'>        
    <div class='in flr ts-label-${options.id}'>${options.label[0]}</div>
    <div class='in flr ts-container-${options.id}'>
        <div class='abs ts-round-${options.id}' style='top: ${factor * 0.2}px; left: ${factor * 0.2}px;'>
        </div>
    </div> 
    `
};

const getQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    let querys_ = {};
    for (const param of params) {
        querys_[param[0]] = param[1];
    }
    return querys_;
};

const rrb = () => !dev ? '' : `background: ${randomColor()} !important`;
