
const clientID = 'engine';
const viewMetaData = {
    clientID,
    mainTitle: 'Engine',
    favicon: {
        type: 'image/png',
        path: '/assets/underpost.png'
    },
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    router: `./src/client/${clientID}/client-core.js`,
    styles: [
        `./src/client/${clientID}/assets/style/global.css`,
        `./src/client/${clientID}/assets/style/spinner-ellipsis.css`
    ]
};

// module render group
const viewPaths = [
    {
        path: '/',
        homePaths: ['/'],
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
        path: '/editor',
        homePaths: ['/'],
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
        path: '/markdown',
        homePaths: ['/'],
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
        path: '/vanilla-js',
        homePaths: ['/'],
        title: { en: 'vanilla-js', es: 'vanilla-js' },
        component: 'vanilla_js',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

export {
    viewMetaData,
    viewPaths
};