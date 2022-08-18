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
    <div class='in container banner' style='${borderChar(1, 'white')}'>
        <img 
            class='inl' 
            src='/assets-underpost/pwa/android-chrome-256x256.png' 
            style='width: 40px; height: 40px; top: 8px'> 
        <span style='color: white; ${borderChar(2, '#262626')}'>UNDER</span>post.net
    </div>
`;

const botDescription = () => /*html*/`
    <div class='in container'>
        <a href='/vanilla.js' download><button><i class='fa fa-download' aria-hidden='true'></i> 
            ${renderLang({ es: 'Descargar Libreria JS', en: 'Download JS Library' })}</button></a>

        <a href='/base.css' download><button><i class='fa fa-download' aria-hidden='true'></i> 
            ${renderLang({ es: 'Descargar Base CSS', en: 'Download CSS Base' })}</button></a>
    </div>
`;

const viewMetaData = {
    clientID,
    theme,
    mainTitle: 'underpost.net',
    host: 'underpost.net',
    socialImg: '/assets-underpost/underpost-social.jpg',
    themeIcons: {
        path: '/assets-underpost/pwa',
        color: 'red'
    },
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
    }
];

const underpost = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    botDescription
};

export { underpost };