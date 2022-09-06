'use strict';

import fs from 'fs';
import parser from 'ua-parser-js';
import UglifyJS from 'uglify-js';
import CleanCSS from 'clean-css';
import {
    buildURL,
    commonFunctions,
    getHash,
    newInstance,
    randomColor,
    replaceAll,
    buildBaseUri,
    clearSubUri
} from '../api/util.js';
import { logger } from './logger.js';
import dotenv from 'dotenv';
import { renderSitemap, buildLocSitemap } from './sitemap.js';
import { copyDir, deleteFolderRecursive } from './files.js';
import { dataStatics, renderStatics } from './statics.js';
import { renderRobots } from './robots.js';

dotenv.config();

const cssClientCore = `html{scroll-behavior:smooth}.fl{position:relative;display:flow-root}.abs,.in{display:block}.fll{float:left}.flr{float:right}.abs{position:absolute}.in,.inl{position:relative}.inl{display:inline-table}.fix{position:fixed;display:block}.center{transform:translate(-50%,-50%);top:50%;left:50%;width:100%;text-align:center}`;


const defaultTheme = [
    'black',
    '#cfcfcf',
    'magenta',
    'white',
    '#1f1f1f',
    '#141414',
    'purple',
    'gray',
    '#f1f1f1',
    '#888',
    '#555'
];

const renderStyleView = (dirStyle, viewMetaData) => {
    if (viewMetaData.theme) {
        let engineTheme = fs.readFileSync(dirStyle, viewMetaData.charset);
        defaultTheme.map((color, i) => engineTheme = replaceAll(engineTheme, color, viewMetaData.theme[i]));
        return engineTheme;
    }
    if (dirStyle == './underpost_modules/underpost-library/engine/global.css' && false) {
        let engineTheme = fs.readFileSync(dirStyle, viewMetaData.charset);
        defaultTheme.map(color => engineTheme = replaceAll(engineTheme, color, randomColor()));
        return engineTheme;
    }
    return fs.readFileSync(dirStyle, viewMetaData.charset);
};

const renderComponents = () => viewPaths.map(path =>/*html*/ !path.clone ? `
    <top-${path.component}></top-${path.component}>
    <${path.component}>
        ${this[path.options ? path.options.origin : path.component].init(path.options)}
    </${path.component}>
    <bot-${path.component}></bot-${path.component}>
`: '').join('');

const validatePaths = viewPaths =>
    build || (!dev) ? viewPaths.map(x => {
        x.path = clearSubUri(x.path);
        if (x.paths) x.paths = x.paths.map(x => clearSubUri(x));
        x.homePaths = x.homePaths.map(y => clearSubUri(y));
        return x;
    }) : viewPaths;

const renderView = dataView => {
    const { view, viewMetaData, viewPaths } = dataView;
    let jsClientCore = `(function(){

        const dev =  ${process.env.NODE_ENV == 'development' && process.argv[2] != 'build' ? 'true' : 'false'};
        const build = ${process.argv[2] == 'build'};
        if(!dev){
            console.log = () => null;
            console.error = () => null;
            console.warn = () => null;
        }

        ${commonFunctions()}
        ${fs.readFileSync('./src/client/core/vanilla.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/input.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/session.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/render.js', viewMetaData.charset)}

        const validatePaths = ${validatePaths};
        const version = '${process.env.npm_package_version}';
        const viewPaths = validatePaths(JSON.parse('${JSON.stringify(viewPaths.filter(path => path.render))}'));
        let view = validatePaths([JSON.parse('${JSON.stringify(view)}')])[0];
        const viewMetaData = JSON.parse('${JSON.stringify(viewMetaData)}');
        const maxIdComponent = 50;
        const errorIcon = ${/*html*/"`<i class='fa fa-exclamation-triangle' aria-hidden='true'></i>`"};
        const sucessIcon = ${/*html*/"`<i class='fa fa-check-circle' aria-hidden='true'></i>`"};
        const renderComponents = ${renderComponents};
        const topLabelInput = '35px';
        const botLabelInput = '0px';
        const banner = ${dataView.banner ? dataView.banner : `() => ''`};
        const footer = ${dataView.footer ? dataView.footer : `() => ''`};
        const botDescription = ${dataView.botDescription ? dataView.botDescription : `() => ''`};
        const API_URL = '${process.env.NODE_ENV == 'development' ? process.env.API_URL + ':' + process.env.PORT : process.env.API_URL}';
        let mainColor = '${dataView.theme ? dataView.theme[2] : viewMetaData.mainColor ? viewMetaData.mainColor : 'purple'}';
        let mainBackground = '${dataView.theme ? dataView.theme[0] : viewMetaData.mainBackground ? viewMetaData.mainBackground : 'black'}';
        const mobileLimit = 700;
       
        
        const GLOBAL = this;
        
        ${viewMetaData.apiURIS.map(dataApiUri => `
            const ${dataApiUri.name} = '${dataApiUri.path}';
        `).join('')}
        

        
        console.log('dataView', JSON.stringify(view, null, 4), viewPaths, mainColor);
        ${viewPaths.filter(path => path.render).map(path =>
        path.options && path.options.origin ? '' :
            fs.existsSync(`./src/client/core/${path.component}.js`) ?
                fs.readFileSync(`./src/client/core/${path.component}.js`) :
                fs.readFileSync(`./src/client/components/${path.component}.js`)
    ).join('')}
        ${fs.readFileSync('./src/client/core/router.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/keys.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/init-render.js', viewMetaData.charset)}
        
        GLOBAL['auth'] = false;

    })()`;
    if (process.env.NODE_ENV != 'development') jsClientCore = UglifyJS.minify(jsClientCore).code;
    const renderTitle = (view.title[viewMetaData.lang] != '' ? view.title[viewMetaData.lang] + ' - ' : '') + viewMetaData.mainTitle;
    const renderDescription = view.description ? view.description[viewMetaData.lang] :
        viewMetaData.description ? viewMetaData.description[viewMetaData.lang] : 'underpost.net engine app';
    const renderSocialImg = view.socialImg ? `<meta property='og:image' content='${buildURL(viewMetaData)}${view.socialImg}'>` :
        viewMetaData.socialImg ? `<meta property='og:image' content='${buildURL(viewMetaData)}${viewMetaData.socialImg}'>` : '';
    return /*html*/`
    <!DOCTYPE html>
    <html dir='${viewMetaData.dir}' lang='${viewMetaData.lang}'>
        <head>
            <meta charset='${viewMetaData.charset}'>
            <title> ${renderTitle} </title>
            <link rel='icon' type='${viewMetaData.favicon.type}' href='${viewMetaData.favicon.path}'>
            <meta name='viewport' content='initial-scale=1.0, maximum-scale=1.0, user-scalable=0'>

            <link rel='canonical' href='${buildURL(viewMetaData)}${buildBaseUri(view)}'>
          
            <meta name ='title' content='${renderTitle}'>
            <meta name ='description' content='${renderDescription}'>
            <meta name='author' content='${process.env.AUTHOR}'>

            <meta property='og:title' content='${renderTitle}'>
            <meta property='og:description' content='${renderDescription}'>
            ${renderSocialImg}
            <meta property='og:url' content='${buildURL(viewMetaData)}${buildBaseUri(view)}'>
            <meta name='twitter:card' content='summary_large_image'>

            <meta name='apple-mobile-web-app-title' content='${renderTitle}'>
            <meta name='application-name' content='${renderTitle}'>   
            
            ${viewMetaData.themeIcons ?/*html*/`
            <link rel='apple-touch-icon' sizes='180x180' href='${viewMetaData.themeIcons.path}/apple-touch-icon.png'>
            <link rel='icon' type='image/png' sizes='32x32' href='${viewMetaData.themeIcons.path}/favicon-32x32.png'>
            <link rel='icon' type='image/png' sizes='16x16' href='${viewMetaData.themeIcons.path}/favicon-16x16.png'>
            <link rel='icon' type='image/png' sizes='36x36' href='${viewMetaData.themeIcons.path}/android-chrome-36x36.png'>
            <link rel='icon' type='image/png' sizes='48x48' href='${viewMetaData.themeIcons.path}/android-chrome-48x48.png'>
            <link rel='icon' type='image/png' sizes='72x72' href='${viewMetaData.themeIcons.path}/android-chrome-72x72.png'>
            <link rel='icon' type='image/png' sizes='96x96' href='${viewMetaData.themeIcons.path}/android-chrome-96x96.png'>
            <link rel='icon' type='image/png' sizes='144x144' href='${viewMetaData.themeIcons.path}/android-chrome-144x144.png'>
            <link rel='icon' type='image/png' sizes='192x192' href='${viewMetaData.themeIcons.path}/android-chrome-192x192.png'>
            <link rel='icon' type='image/png' sizes='256x256' href='${viewMetaData.themeIcons.path}/android-chrome-256x256.png'>
            <link rel='icon' type='image/png' sizes='512x512' href='${viewMetaData.themeIcons.path}/android-chrome-512x512.png'>
            <!-- <link rel='icon' type='image/png' sizes='384x384' href='/android-chrome-384x384.png'> -->
            <link rel='icon' type='image/png' sizes='16x16' href='${viewMetaData.themeIcons.path}/favicon-16x16.png'>           
            <link rel='mask-icon' href='${viewMetaData.themeIcons.path}/safari-pinned-tab.svg' color='${viewMetaData.themeIcons.color}'>
            <meta name='msapplication-TileColor' content='${viewMetaData.themeIcons.color}'>
            <meta name='msapplication-TileImage' content='${buildURL(viewMetaData)}${viewMetaData.themeIcons.path}/mstile-144x144.png'>
            <meta name='theme-color' content='${viewMetaData.themeIcons.color}'>
            `: ''}

            <style>
                ${new CleanCSS().minify(cssClientCore
        + viewMetaData.styles.map(dirStyle => renderStyleView(dirStyle, viewMetaData)).join('')
        + viewPaths.filter(path => path.render).map(path => path.component + `{ display: none; }`).join('')
    ).styles}
            </style>
            <link rel='stylesheet' href='/fontawesome/all.min.css'>
            <!-- Script element sourcing TinyMCE -->
            <script type='application/javascript' src= '/tinymce/tinymce.min.js'></script>
            <link rel='stylesheet' href='/simplemde/simplemde.min.css'>
            <script type='application/javascript' src='/simplemde/simplemde.min.js'></script>
            <script type='application/javascript' src='/marked/marked.min.js'></script>

            <link rel='stylesheet' href='/assets/prism/prism.css'>
            <script type='application/javascript' src='/assets/prism/prism.js'></script>

            <link rel='stylesheet' href='/spectre-markdown.css/dist/markdown.min.css'>

            ${viewMetaData.googleTag ?/*html*/`
            <!-- https://www.npmjs.com/package/universal-analytics -->
            <!-- Google tag (gtag.js) -->
            <script async src='https://www.googletagmanager.com/gtag/js?id=${viewMetaData.googleTag}'></script>
            <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${viewMetaData.googleTag}');
            </script>
            `: ''}
        </head>
        <body>                  
            <script>
                ${process.env.NODE_ENV == 'development' ? jsClientCore : UglifyJS.minify(jsClientCore).code}
            </script>
        </body>
    </html>

`;
};

const ssr = async (app, renderData) => {
    const banner = renderData[0].banner;
    const botDescription = renderData[0].botDescription;
    const footer = renderData[0].footer;
    renderData = newInstance(renderData);

    let { viewPaths, baseHome, viewMetaData } = renderData[0];

    // build validator
    if (process.argv[3] && process.argv[3] != viewMetaData.clientID) return;

    renderData.map((renderSingle, i) => {
        if (i > 0) {
            const mergeModule = renderSingle.viewPaths;
            mergeModule.shift();
            viewPaths = viewPaths.concat(mergeModule.map(mergeFix => {
                mergeFix.homePaths.push(viewPaths[0].path);
                mergeFix.path = mergeFix.path.replace(renderSingle.baseHome, baseHome);
                if (mergeFix.paths) mergeFix.paths = mergeFix.paths.map(x => x.replace(renderSingle.baseHome, baseHome));
                return mergeFix;
            }));
            viewMetaData.apiURIS = viewMetaData.apiURIS.concat(renderSingle.viewMetaData.apiURIS);
        }
    });
    renderData[0].viewPaths = viewPaths;
    renderData[0].viewMetaData = viewMetaData;
    renderData[0].banner = banner;
    renderData[0].botDescription = botDescription;
    renderData[0].footer = footer;

    if (process.argv[2] == 'build')
        deleteFolderRecursive(`./builds/${viewMetaData.clientID}`);

    let sitemap = '';

    const renders = viewPaths.filter(view => view.render).map(view => {
        if (view.sitemap !== false)
            sitemap += buildLocSitemap(view, viewMetaData);

        const buildView = renderView({
            view,
            ...renderData[0]
        });

        if (process.argv[2] == 'build' && !view.path.split('/').find(x => x[0] == ':')) {

            // TODO: crear config htacces para parametros redirigir a ruta raiz

            console.log(view.path, `./builds${view.path}/index.html`);
            fs.mkdirSync(`./builds${view.path}`, { recursive: true });
            fs.writeFileSync(`./builds${view.path}/index.html`, buildView, 'utf8');

            if (view.component == 'main_menu' && viewMetaData.htaccess)
                fs.writeFileSync(`./builds${view.path}/.htaccess`, `
            # RewriteEngine On
            # RewriteCond %{HTTPS} off
            # RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
            
            ErrorDocument 404 ${buildURL(viewMetaData)}${buildBaseUri(view)}?uri=%{REQUEST_URI}
                `);

        }

        return {
            path: view.path,
            render: buildView
        };
    });

    if (viewMetaData.staticSitemap)
        viewMetaData.staticSitemap.map(pathSitemap => {
            if (fs.existsSync(pathSitemap))
                sitemap += fs.readFileSync(pathSitemap, 'utf8');
        });

    renderSitemap(app, sitemap, viewMetaData);
    renderStatics(app, viewMetaData);
    await renderRobots(app, viewMetaData);

    renders.map(view => app.get(view.path,
        (req, res) => {
            res.setHeader('Content-Type', 'text/html');
            logger.info(parser(req.headers['user-agent']));
            return res.status(200).end(view.render);
        }));


    // deleteFolderRecursive(`./builds/`);
    // return;

    if (process.argv[2] == 'build') {
        // deleteFolderRecursive(`./builds/${viewMetaData.clientID}`);
        fs.mkdirSync(`./builds/${viewMetaData.clientID}`, { recursive: true });

        dataStatics.map(async dataStatic => {
            console.log('build statics -> ', `./builds/${viewMetaData.clientID}${dataStatic[0]}`);
            await copyDir(dataStatic[1], `./builds/${viewMetaData.clientID}${dataStatic[0]}`);

        });

        if (viewMetaData.statics)
            viewMetaData.statics.map(async dataStatic => {
                console.log('build statics -> ', `./builds/${viewMetaData.clientID}${dataStatic[0]}`);
                await copyDir(dataStatic[1], `./builds/${viewMetaData.clientID}${dataStatic[0]}`);
            });
    }



};

const getBaseComponent = (baseHome, component, namePath) => {
    return {
        path: baseHome + `/${namePath}`,
        homePaths: [baseHome],
        title: { en: '', es: '' },
        component,
        options: false,
        menu: false,
        home: false,
        nohome: false,
        render: true,
        display: false,
        sitemap: false
    }
};

export {
    ssr,
    cssClientCore,
    renderView,
    getBaseComponent
};