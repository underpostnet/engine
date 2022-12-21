import { getBaseComponent } from '../../modules/ssr.js';
import { cssClientCore } from '../../modules/ssr.js';
import UglifyJS from 'uglify-js';
import CleanCSS from 'clean-css';
import fs from 'fs';
import { baseStaticUri, commonFunctions } from '../../api/util.js';
import { media } from './media.js';

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
        ${renderLangBtns()}
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
    googleTag: 'G-937YXKTP88',
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
    fonts: [
        {
            name: 'retro',
            src: '/fonts-underpost/retro/PressStart2P.ttf',
            format: 'truetype', // opentype
            activesClass: []
        },
        {
            name: 'gothic',
            src: '/fonts-underpost/gothic/GOTHIC.ttf',
            format: 'truetype', // opentype
            activesClass: ['body', 'button']
        }
    ],
    cursors: [
        {
            src: '/cursors-underpost/black-default.png',
            x: -30,
            y: -30,
            activesClass: ['body']
        },
        {
            src: '/cursors-underpost/black-pointer.png',
            x: -30,
            y: -30,
            activesClass: []
        }
    ],
    apiURIS: [],
    lang: 'en',
    charset: 'utf-8',
    dir: 'ltr',
    styles: [
        `./underpost_modules/underpost-library/engine/global.css`,
        `./underpost_modules/underpost-library/engine/spinner-ellipsis.css`
    ],
    statics: [
        ['/assets-underpost', './underpost_modules/underpost-library/assets'],
        ['/fonts-underpost', './underpost_modules/underpost-library/fonts'],
        ['/cursors-underpost', './underpost_modules/underpost-library/cursors']
    ],
    srcJS: ['/github.js', 'https://pixijs.download/release/pixi.js', 'https://beautifier.io/js/lib/beautify.js'],
    srcCSS: [],
    staticSitemap: ['./private-engine/underpost-sitemap'],
    generateZipBuild: true,
    htaccess: true
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
        path: baseHome + '/underpost-boards',
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'underpost_board',
        options: { origin: 'boards', board_username: 'francisco-verdugo' },
        menu: false,
        home: true,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/contracultura-cyberpunk',
        homePaths: [baseHome],
        title: { en: 'Blog Contracultura Cyberpunk', es: 'Blog Contracultura Cyberpunk' },
        component: 'contracultura_cyberpunk',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        microdata: ['WebSite'],
        lang: 'es'
    },
    {
        path: baseHome + '/legacy-gallery',
        homePaths: [baseHome],
        title: { en: 'Legacy Gallery', es: 'Primera Galeria' },
        component: 'legacy_gallery',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true
    },
    {
        path: baseHome + '/underpost_pre_footer',
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component: 'underpost_pre_footer',
        options: false,
        menu: false,
        home: false,
        nohome: false,
        render: false,
        display: false
    },
    {
        path: baseHome + '/yt_download',
        homePaths: [baseHome],
        title: { en: 'YouTube Mp3 downloader', es: 'YouTube Mp3 downloader' },
        component: 'yt_download',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
    },
    {
        path: baseHome + '/media-player',
        homePaths: [baseHome],
        title: { en: 'Audio Player', es: 'Audio Player' },
        component: 'audioplayer',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
    },
    {
        path: baseHome + '/yt_player',
        homePaths: [baseHome],
        title: { en: 'YouTube Player', es: 'YouTube Player' },
        component: 'yt_player',
        options: false,
        menu: true,
        home: false,
        nohome: false,
        render: true,
        display: true,
        session: true
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

    const srcGitHubWidget = fs.readFileSync('./underpost_modules/underpost-library/lib/github-widget.min.js', 'utf8');
    app.get(BSU + '/github.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(srcGitHubWidget);
    });


    if (process.argv[2] == 'build') {
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/vanilla.js`, sourceVanillaJs, 'utf8');
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/base.css`, srcBaseCssLib, 'utf8');
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/github.js`, srcGitHubWidget, 'utf8');
        media.statics(app, viewMetaData.clientID);
    }

}

const underpost = {
    viewMetaData,
    viewPaths,
    baseHome,
    banner,
    botDescription,
    statics,
    theme
};

export { underpost };