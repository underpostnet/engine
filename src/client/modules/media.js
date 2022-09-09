
const clientID = 'media';
const viewMetaData = {
    clientID,
    mainTitle: 'Underpost Media',
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ]
};

const baseHome = '/' + clientID;

// module render group
const viewPaths = [
    {
        path: baseHome,
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'main_menu',
        options: false,
        menu: true,
        home: true,
        nohome: true,
        render: true,
        display: false
    },
    {
        path: baseHome + '/yt_download',
        homePaths: [baseHome],
        title: { en: 'YouTube Mp3 Dowloader', es: 'YouTube Mp3 Dowloader' },
        component: 'yt_download',
        options: false,
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
];


const media = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { media };