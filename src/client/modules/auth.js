
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
        menu: false,
        home: true,
        nohome: true,
        render: true,
        display: true
    },
    {
        path: baseHome + '/register',
        homePaths: [baseHome],
        title: { en: 'Register', es: 'Registrar' },
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
        title: { en: 'Log In', es: 'Iniciar Session' },
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