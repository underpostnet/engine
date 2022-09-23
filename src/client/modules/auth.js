
const clientID = 'auth';
const viewMetaData = {
    clientID,
    mainTitle: 'Auth',
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png'
    },
    apiURIS: [
        {
            name: 'uriAuth',
            path: 'auth'
        }
    ],
    lang: 'es',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
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
        menu: false,
        home: true,
        nohome: true,
        render: true,
        display: true
    },
    {
        path: baseHome + '/register',
        homePaths: [baseHome],
        title: { en: 'Sign up', es: 'Crear Cuenta' },
        component: 'register',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/login',
        homePaths: [baseHome],
        title: { en: 'Log In', es: 'Inicia sesión' },
        component: 'login',
        options: { origin: 'register', mode: 'login' },
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

const authClient = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { authClient };