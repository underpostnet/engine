// import { getBaseComponent } from '../../modules/ssr.js';

const clientID = 'nexodev';
const viewMetaData = {
    clientID,
    mainTitle: 'nexodev.org',
    // description: { en: 'Vanilla JS web Components Gallery, Vanilla JS thin layer library', es: 'Galería de componentes web de Vanilla JS, biblioteca de capa fina de Vanilla JS' },
    favicon: {
        type: 'image/png',
        path: '/assets/nexodev.png'
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

const baseHome = '/nexodev';

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
    }
];

const nexodev = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { nexodev };