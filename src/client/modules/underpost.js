
const clientID = 'underpost';
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
    styles: [
        `./src/client/assets/styles/global.css`,
        `./src/client/assets/styles/spinner-ellipsis.css`
    ]
};

const baseHome = '/underpost';

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
        path: baseHome + '/my-content',
        homePaths: [baseHome],
        title: { en: 'My Content', es: 'Mi contenido' },
        component: 'my_content',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    }
];

const underpost = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { underpost };