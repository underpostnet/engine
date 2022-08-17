
const clientID = 'engine';
const viewMetaData = {
    clientID,
    mainTitle: 'Engine',
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png'
    },
    apiURIS: [
        {
            name: 'apiUploader',
            path: 'uploader'
        }
    ],
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
        path: baseHome + '/editor',
        homePaths: [baseHome],
        title: { en: 'editor', es: 'editor' },
        component: 'editor',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
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
        display: true,
        session: true
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
        display: true,
        session: true
    },
    {
        path: baseHome + '/my-content',
        homePaths: [baseHome],
        title: { en: 'My Content', es: 'Mi contenido' },
        component: 'my_content',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
    },
    {
        path: baseHome + '/view-content',
        homePaths: [baseHome],
        title: { en: 'View Content', es: 'Ver contenido' },
        component: 'view_content',
        options: false,
        menu: false,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
    }
];

const engine = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { engine };