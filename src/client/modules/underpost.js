import { getBaseComponent } from '../../modules/ssr.js';

const clientID = 'underpost';

const theme = [
    'black',
    '#cfcfcf',
    'red',
    'white',
    '#1f1f1f',
    '#141414',
    '#800000',
    'gray',
    '#f1f1f1',
    '#888',
    '#555'
];

const banner = () =>/*html*/`
    <img 
        class='inl' 
        src='/assets-underpost/pwa/android-chrome-256x256.png' 
        style='width: 40px; height: 40px; top: 8px'> 
    <span style='color: white; ${borderChar(2, '#262626')}'>UNDER</span>post.net
`;

const viewMetaData = {
    clientID,
    theme,
    mainTitle: 'underpost.net',
    description: { en: 'Vanilla JS web Components Gallery, Vanilla JS thin layer library', es: 'Galería de componentes web de Vanilla JS, biblioteca de capa fina de Vanilla JS' },
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./src/client/assets/styles/global.css`,
        `./src/client/assets/styles/spinner-ellipsis.css`
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
        ...getBaseComponent(baseHome, 'js_demo')
    },
    {
        path: baseHome + '/js-demo',
        homePaths: [baseHome],
        title: { en: 'js demo', es: 'js demo' },
        component: 'js_demo_home',
        options: { origin: 'js_demo', mode: 'home_example' },
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/vanilla-js',
        homePaths: [baseHome],
        title: { en: 'JS Library', es: 'Libreria JS' },
        component: 'vanilla_js_doc',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: false,
        display: true
    },
    {
        path: baseHome + '/base-css',
        homePaths: [baseHome],
        title: { en: 'Css Source', es: 'Fuente Css' },
        component: 'vanilla_css_doc',
        options: { origin: 'vanilla_js_doc', mode: 'css' },
        menu: true,
        home: false,
        nohome: false,
        render: false,
        display: true
    }
];

const underpost = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner
};

export { underpost };