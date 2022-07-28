
const clientID = 'public';
const viewMetaData = {
    clientID,
    mainTitle: 'underpost.net',
    favicon: {
        type: 'image/png',
        path: '/assets/underpost.png'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    externalRouter: [
        {
            type: 'pre_menu_container',
            name: { en: 'markdown', es: 'markdown' },
            link: '/markdown'
        },
        {
            type: 'pre_menu_container',
            name: { en: 'editor', es: 'editor' },
            link: '/editor'
        },
        {
            type: 'pre_menu_container',
            name: { en: 'js-demo', es: 'js-demo' },
            link: '/js-demo'
        }
    ],
    styles: [
        `./src/client/assets/styles/global.css`,
        `./src/client/assets/styles/spinner-ellipsis.css`
    ]
};

const baseHome = '/en/';

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
        path: baseHome + 'vanilla-js-gallery',
        homePaths: [baseHome],
        title: { en: 'vanilla js gallery', es: 'vanilla js gallery' },
        component: 'vanilla_js_gallery',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

const _public = {
    viewMetaData,
    viewPaths
};

export { _public };