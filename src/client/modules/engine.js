
const clientID = 'engine';
const viewMetaData = {
    clientID,
    mainTitle: 'Engine',
    favicon: {
        type: 'image/png',
        path: '/assets/underpost.png'
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

const baseHome = '/engine';

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
        path: baseHome + '/editor',
        homePaths: [baseHome],
        title: { en: 'editor', es: 'editor' },
        component: 'editor',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/markdown',
        homePaths: [baseHome],
        title: { en: 'markdown', es: 'markdown' },
        component: 'markdown',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/js-demo',
        homePaths: [baseHome],
        title: { en: 'js-demo', es: 'js-demo' },
        component: 'js_demo',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

const engine = {
    viewMetaData,
    viewPaths
};

export { engine };