
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

const commonFunctions = () => `
    const getHash = ${getHash};
    const s4 = ${s4};
    const range = ${range};
    const random = ${random};
    const randomColor = ${randomColor};
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
    replaceAll
};