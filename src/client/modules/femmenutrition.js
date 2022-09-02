

const clientID = 'femmenutrition';
const viewMetaData = {
    clientID,
    mainTitle: 'Femme Nutrition',
    host: 'femmenutrition.cl',
    subDomain: 'www',
    description: { es: 'femmenutrition', en: 'femmenutrition', hide: true },
    socialImg: '/assets/apps/femmenutrition/social.jpg',
    mainColor: 'white',
    mainBackground: '#ED5C6B',
    favicon: {
        type: 'image/png',
        path: '/assets/apps/femmenutrition/favicon.png',
        ico: '/src/client/assets/apps/femmenutrition/favicon.ico'
    },
    apiURIS: [],
    lang: 'es',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/femmenutrition.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets/apps/femmenutrition', `./src/client/assets/apps/femmenutrition`]
    ]
};

const banner = () => /*html*/`

<div class='in container'>
    <img src='/assets/apps/femmenutrition/logo.png' style='width: 250px'>
</div>

`;

const footer = () => /*html*/`

<footer class='fl container'>
    <!--
    <div class='in flr'>
            <a href='https://github.com/underpostnet/underpost-engine'> 
            <img src='/assets/common/github.png' class='inl' style='width: 20px; top: 5px'> 
            
            </a>                      
    </div>
    -->
    <!-- v${version} -->
    <div class='in fll'>
            Desarrollado por 
            <img class='inl' style='width: 20px; top: 3px' src='https://www.nexodev.org/assets/apps/nexodev/app/mstile-144x144.png' alt='nexodev.org'>
            <a href='https://www.nexodev.org/'><strong style='font-size: 22px'>nexo</strong>dev.org</a>
    </div>     
</footer>   

`;

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
        path: baseHome + '/landing',
        homePaths: [baseHome],
        title: { en: 'landing', es: 'landing' },
        component: 'femmenutrition_landing',
        options: false,
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true,
        session: false
    }
];


const femmenutrition = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    footer
};

export { femmenutrition };