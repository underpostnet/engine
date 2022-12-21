// import { getBaseComponent } from '../../modules/ssr.js';
import { media } from './media.js';

const clientID = 'nexodev';

const banner = () =>/*html*/`
    <div class='in container banner' style='${borderChar(1, 'white')}'>
        <img 
            class='inl' 
            src='/assets/apps/nexodev/app/android-chrome-256x256.png' 
            style='width: 40px; height: 40px; top: 8px'> 
        <span style='color: white; font-size: 40px; ${borderChar(2, 'purple')}'>nexo</span>dev.org
    </div>
`;

const botDescription = () => /*html*/`
    <div class='in container'>
        ${renderLangBtns()}    
    </div>
`;

const viewMetaData = {
    clientID,
    mainTitle: 'nexodev.org',
    host: 'nexodev.org',
    googleTag: 'G-D6Q3K5EJH8',
    subDomain: 'www',
    socialImg: '/assets/apps/nexodev/social.jpg',
    themeIcons: {
        path: '/assets/apps/nexodev/app',
        color: '#69055F'
    },
    description: { en: 'nexodev.org - High Technology within reach of your Projects.', es: 'nexodev.org - Alta Tecnología al alcance de tus Proyectos. Hosting WordPress, Desarrollo Web, Desarrollo de Aplicaciones Multiplataforma, Servicio de Email Newsletter, Servicio de Analítica de Datos y Aplicaciones Matemáticas.' },
    favicon: {
        type: 'image/png',
        path: '/assets/apps/nexodev/nexodev.png',
        ico: '/src/client/assets/apps/nexodev/favicon.ico'
    },
    apiURIS: [],
    lang: 'es',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets/apps/nexodev', `./src/client/assets/apps/nexodev`]
    ],
    fonts: []
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
        component: 'nexodev_landing',
        options: false,
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    }
];

const statics = app => {
    media.statics(app, viewMetaData.clientID);
};

const nexodev = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    botDescription,
    statics
};

export { nexodev };