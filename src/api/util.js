
const uriUtil = 'util';

const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);

const getHash = () => s4() + s4() +
    '-' + s4() +
    '-' + s4() +
    '-' + s4() +
    '-' + s4() + s4() + s4();

const range = (start, end) => {
    return Array.apply(0, Array(end - start + 1))
        .map((element, index) => index + start);
};

const apiUtil = app => {
    app.get(`/api/${uriUtil}/hash`, (req, res) => res.status(200).end(getHash()));
};

const random = (max, min) => Math.floor(Math.random() * (max - min + 1)) + min;

const randomColor = () => '#' + Math.floor(Math.random() * 16777215).toString(16);

const replaceAll = (str, replaceWhat, replaceTo) => {
    replaceWhat = replaceWhat.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return str.replace(new RegExp(replaceWhat, 'g'), replaceTo);
};

const renderLang = (langs, req) => {
    const getLang = `${req.acceptsLanguages()[0].split('-')[0]}`.toLowerCase();
    if (Object.keys(langs).includes(getLang)) return langs[getLang];
    return langs['en'];
};

const passwordValidator = (str, req) => {

    let msg = '';
    let validate = true;
    let regex;

    if (str.length < 8) {
        validate = false;
        msg += ` > ${renderLang({ en: '8 char Length', es: '8 caracteres' }, req)}`;
    }

    regex = /^(?=.*[a-z]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += ` > ${renderLang({ en: 'lowercase', es: 'una minuscula' }, req)}`;
    }

    regex = /^(?=.*[A-Z]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += ` > ${renderLang({ en: 'uppercase', es: 'una mayuscula' }, req)}`;
    }

    regex = /^(?=.*[0-9_\W]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += ` > ${renderLang({ en: 'number or special', es: 'numero o caracter especial' }, req)}`;
    }

    return {
        msg,
        validate
    }
};


const emailValidator = (str, req) => {

    const validate = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,8})+$/.test(str);
    return {
        msg: validate ? '' : ` > ${renderLang({ en: 'invalid email', es: 'email invalido' }, req)}`,
        validate
    }
};

const newInstance = obj => JSON.parse(JSON.stringify(obj));

const commonFunctions = () => `
    const getHash = ${getHash};
    const s4 = ${s4};
    const range = ${range};
    const random = ${random};
    const randomColor = ${randomColor};
    const passwordValidator = ${passwordValidator};
    const emailValidator = ${emailValidator};
    const newInstance = ${newInstance};
`;

export {
    uriUtil,
    apiUtil,
    commonFunctions,
    s4,
    getHash,
    range,
    random,
    randomColor,
    replaceAll,
    passwordValidator,
    emailValidator,
    renderLang,
    newInstance
};