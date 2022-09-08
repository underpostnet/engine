// import { getBaseComponent } from '../../modules/ssr.js';

const clientID = 'dogmadual';

const theme = [
    'black',
    '#cfcfcf',
    'gray',
    'white',
    '#1f1f1f',
    '#141414',
    '#999999',
    'gray',
    '#f1f1f1',
    '#888',
    '#555'
];

const banner = () =>/*html*/`
    <div class='in container banner' style='${borderChar(1, 'white')}'>
        <img 
        class='inl' 
        src='/assets/apps/dogmadual/app/android-chrome-256x256.png' 
        style='width: 40px; height: 40px; top: 8px'> 
        DOGMADUAL.com
    </div>      
`;

const botDescription = () => /*html*/`
    <div class='in container'>
        ${renderLangBtns()}    
    </div>
`;

const viewMetaData = {
    clientID,
    theme,
    subDomain: 'www',
    mainTitle: 'DOGMADUAL.com',
    host: 'dogmadual.com',
    googleTag: 'G-K6HWCT31E3',
    socialImg: '/assets/apps/dogmadual/dogmadual-social.jpg',
    themeIcons: {
        path: '/assets/apps/dogmadual/app',
        color: '#000000'
    },
    description: { en: 'Virtual Machine Development', es: 'Virtual Machine Development' },
    favicon: {
        type: 'image/png',
        path: '/assets/apps/dogmadual/app/android-chrome-192x192.png',
        ico: '/src/client/assets/apps/dogmadual/favicon.ico'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets/apps/dogmadual', `./src/client/assets/apps/dogmadual`]
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
        display: true
    },
    {
        path: baseHome + `/landing`,
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'dogmadual_landing',
        options: false,
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    }
];

const dogmadual = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    theme,
    botDescription
};

export { dogmadual };