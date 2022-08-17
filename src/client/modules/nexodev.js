// import { getBaseComponent } from '../../modules/ssr.js';

const clientID = 'nexodev';

const banner = () =>/*html*/`
    <img 
        class='inl' 
        src='/assets/nexodev/app/android-chrome-256x256.png' 
        style='width: 40px; height: 40px; top: 8px'> 
    <span style='color: white; font-size: 40px; ${borderChar(2, 'purple')}'>nexo</span>dev.org
`;

const viewMetaData = {
    clientID,
    mainTitle: 'nexodev.org',
    host: 'nexodev.org',
    description: { en: 'High Technology within reach of your Projects.', es: 'Alta Tecnología al alcance de tus Proyectos.' },
    favicon: {
        type: 'image/png',
        path: '/assets/nexodev/nexodev.png'
    },
    apiURIS: [],
    lang: 'es',
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

const nexodev = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner
};

export { nexodev };