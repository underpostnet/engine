
const clientID = 'editor';
const viewMetaData = {
    clientID,
    mainTitle: 'Editor',
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
        title: { en: 'Editor', es: 'Editor' },
        component: 'editor',
        options: false,
        menu: true,
        home: true,
        nohome: true,
        render: true,
        display: true
    }
];

export {
    viewMetaData,
    viewPaths
};