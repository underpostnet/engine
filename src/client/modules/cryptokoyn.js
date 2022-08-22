
const clientID = 'cryptokoyn';

const banner = () =>/*html*/`
    <div class='in container banner' style='${borderChar(1, 'white')}'>
        <span style='${borderChar(1, 'yellow')}'>
            KO<span class='inl' style='color: red; font-size: 50px; top: 5px; ${borderChar(1, 'white')}'>λ</span>N
            <br>
            Wallet
        </span>               
    </div>    
`;

const theme = [
    'black',
    '#cfcfcf',
    'yellow',
    'white',
    '#1f1f1f',
    '#141414',
    'orange',
    'gray',
    '#f1f1f1',
    '#888',
    '#555'
];

const viewMetaData = {
    clientID,
    theme,
    subDomain: 'www',
    mainTitle: 'Koyn UI',
    host: 'cryptokoyn.net',
    socialImg: '/assets/apps/cryptokoyn/koyn-social.png',
    themeIcons: {
        path: '/assets/apps/cryptokoyn/app',
        color: 'yellow'
    },
    description: { en: 'CyberiaOnline Asymmetric Key Manager', es: 'Gestor de Llaves asymetricias de CyberiaOnline' },
    favicon: {
        type: 'image/png',
        path: '/assets/apps/cryptokoyn/favicon.png',
        ico: '/src/client/assets/apps/cryptokoyn/app/favicon.ico'
    },
    apiURIS: [
        {
            name: 'uriApi',
            path: 'keys'
        }
    ],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets/apps/cryptokoyn', `./src/client/assets/apps/cryptokoyn`]
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
        home: false,
        nohome: true,
        render: true,
        display: false
    },
    {
        path: baseHome + '/keys/create',
        homePaths: [baseHome],
        title: { en: 'Create Key', es: 'Crear Llaves' },
        component: 'form_key',
        options: false,
        menu: true,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/keys/search',
        homePaths: [baseHome],
        title: { en: 'Search Key', es: 'Buscar Llave' },
        component: 'form_key_search',
        options: { origin: 'form_key', mode: 'search' },
        menu: true,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/keys/list',
        homePaths: [baseHome],
        title: { en: 'Keys List', es: 'Listar Llave' },
        component: 'table_keys',
        options: false,
        menu: false,
        home: false,
        nohome: false,
        render: true,
        display: false
    }
];

const cryptokoyn = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner
};

export { cryptokoyn };