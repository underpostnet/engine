import { getBaseComponent } from '../../modules/ssr.js';
import { cssClientCore } from '../../modules/ssr.js';
import UglifyJS from 'uglify-js';
import CleanCSS from 'clean-css';
import fs from 'fs';
import { baseStaticUri, commonFunctions } from '../../api/util.js';

const clientID = 'underpost';

const theme = [
    'black',
    '#cfcfcf',
    'red',
    'white',
    '#1f1f1f',
    '#141414',
    '#800000',
    'gray',
    '#f1f1f1',
    '#888',
    '#555'
];

const banner = () =>/*html*/`
    <div class='in container banner' style='${borderChar(1, 'white')}'>
        <img 
            class='inl' 
            src='/assets-underpost/pwa/android-chrome-256x256.png' 
            style='width: 40px; height: 40px; top: 8px'> 
        <span style='color: white; ${borderChar(2, '#262626')}'>UNDER</span>post.net
    </div>
`;

const botDescription = () => /*html*/`
    <div class='in container'>
        <a href='/vanilla.js' download><button><i class='fa fa-download' aria-hidden='true'></i> 
            ${renderLang({ es: 'Descargar Libreria JS', en: 'Download JS Library' })}</button></a>

        <a href='/base.css' download><button><i class='fa fa-download' aria-hidden='true'></i> 
            ${renderLang({ es: 'Descargar Base CSS', en: 'Download CSS Base' })}</button></a>
    </div>
`;

const viewMetaData = {
    clientID,
    theme,
    mainTitle: 'underpost.net',
    host: 'underpost.net',
    socialImg: '/assets-underpost/underpost-social.jpg',
    themeIcons: {
        path: '/assets-underpost/pwa',
        color: 'red'
    },
    description: { en: 'Vanilla JS web Components Gallery, Vanilla JS thin layer library', es: 'Galería de componentes web de Vanilla JS, biblioteca de capa fina de Vanilla JS' },
    favicon: {
        type: 'image/png',
        path: '/assets-underpost/underpost.png',
        ico: '/underpost_modules/underpost-library/favicon.ico'
    },
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets-underpost', './underpost_modules/underpost-library/assets']
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
        ...getBaseComponent(baseHome, 'js_demo')
    },
    {
        path: baseHome + '/js-demo',
        homePaths: [baseHome],
        title: { en: 'js demo', es: 'js demo' },
        component: 'js_demo_home',
        options: { origin: 'js_demo', mode: 'home_example' },
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    }
];

const statics = app => {

    const BSU = baseStaticUri(viewMetaData);

    const sourceVanillaJs =
        UglifyJS.minify(
            commonFunctions() +
            fs.readFileSync('./src/client/core/vanilla.js', 'utf-8')
        ).code;
    app.get(BSU + '/vanilla.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(sourceVanillaJs);
    });

    const srcBaseCssLib = cssClientCore + new CleanCSS().minify(
        fs.readFileSync('./underpost_modules/underpost-library/engine/global.css', 'utf-8')
        + fs.readFileSync('./underpost_modules/underpost-library/engine/spinner-ellipsis.css', 'utf-8')
    ).styles;
    app.get(BSU + '/base.css', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('text/css; charset= charset=utf-8')
        });
        return res.end(srcBaseCssLib);
    });

    if (process.argv[2] == 'build') {
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/vanilla.js`, sourceVanillaJs, 'utf8');
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/base.css`, srcBaseCssLib, 'utf8');
    }

}

const underpost = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    botDescription,
    statics
};

export { underpost };