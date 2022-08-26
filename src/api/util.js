
import dotenv from 'dotenv';

dotenv.config();

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

const buildBaseApiUri = () => {
    if (process.env.NODE_ENV == 'development')
        return '';
    return '/' + process.env.BASE_API_URI;
};

const apiUtil = app => {
    app.get(`${buildBaseApiUri()}/api/${uriUtil}/hash`, (req, res) => res.status(200).end(getHash()));
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

const cap = str => str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const uniqueArray = arr =>
    arr.filter((item, pos) => arr.indexOf(item) == pos);

const clearSubUri = path => {
    let _path = path.slice(1).split('/');
    _path.shift();
    return `/${_path.join('/')}`
};

const clearURI = uri => uri.split('#')[0].split('?')[0];

const commonFunctions = () => `
    const getHash = ${getHash};
    const s4 = ${s4};
    const range = ${range};
    const random = ${random};
    const randomColor = ${randomColor};
    const passwordValidator = ${passwordValidator};
    const emailValidator = ${emailValidator};
    const newInstance = ${newInstance};
    const cap = ${cap};
    const uniqueArray = ${uniqueArray};
    const clearSubUri = ${clearSubUri};
    const clearURI = ${clearURI};
`;

const buildURL = (viewMetaData, subDomain) => {
    if (process.argv[2] == 'build' && process.env.NODE_ENV == 'development')
        return `http://localhost:${process.env.BUILD_DEV_PORT}`;
    if (process.env.NODE_ENV == 'development')
        return `http://localhost:${process.env.PORT}`;
    if (process.env.SSL == 'true')
        return `https://${subDomain ? subDomain + '.' : viewMetaData.subDomain ? viewMetaData.subDomain + '.' : ''}${viewMetaData.host}`;
    return `http://${subDomain ? subDomain + '.' : viewMetaData.subDomain ? viewMetaData.subDomain + '.' : ''}${viewMetaData.host}`;
};

const buildBaseUri = view => {
    if (process.env.NODE_ENV == 'development' && process.argv[2] != 'build')
        return view.path;
    return clearSubUri(view.path);
};

const baseStaticUri = viewMetaData =>
    process.env.NODE_ENV != 'development' ? '/' + viewMetaData.clientID : '';

const baseStaticClient = viewMetaData =>
    process.env.NODE_ENV == 'development' && process.argv[2] != 'build' ? '/' + viewMetaData.clientID : '';

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
    newInstance,
    cap,
    buildURL,
    buildBaseApiUri,
    buildBaseUri,
    uniqueArray,
    baseStaticUri,
    baseStaticClient,
    clearSubUri
};