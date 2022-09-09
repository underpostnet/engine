
const clientID = 'dev';
const viewMetaData = {
    clientID,
    mainTitle: 'Development Dashboard',
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    fonts: [
        {
            name: 'gothic',
            src: '/fonts-underpost/gothic/GOTHIC.ttf',
            format: 'truetype', // opentype
            activesClass: ['body', 'button']
        }
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
        path: baseHome + '/home_dev',
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'home_dev',
        options: false,
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
];


const dev = {
    viewMetaData,
    viewPaths,
    baseHome
};

export { dev };