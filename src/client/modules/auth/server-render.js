
const clientID = 'auth';
const viewMetaData = {
    clientID,
    mainTitle: 'Auth',
    favicon: {
        type: 'image/png',
        path: '/assets/underpost.png'
    },
    apiURIS: [
        {
            name: 'uriAuth',
            path: 'auth'
        }
    ],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    externalRouter: [],
    styles: [
        `./src/client/assets/styles/global.css`,
        `./src/client/assets/styles/spinner-ellipsis.css`
    ]
};

const baseHome = '/auth/';

// module render group
const viewPaths = [
    {
        path: baseHome.slice(0, -1),
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'main_menu',
        options: false,
        menu: false,
        home: true,
        nohome: true,
        render: true,
        display: true
    },
    {
        path: baseHome + 'register',
        homePaths: [baseHome],
        title: { en: 'Register', es: 'Registrar' },
        component: 'register',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

const authClient = {
    viewMetaData,
    viewPaths
};

export { authClient };