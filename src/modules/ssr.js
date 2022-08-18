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
    buildBaseUri
} from '../api/util.js';
import { logger } from './logger.js';
import dotenv from 'dotenv';
import { renderSitemap, buildLocSitemap } from './sitemap.js';
import express from 'express';
import robotstxt from 'generate-robotstxt';

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
    if (dirStyle == './src/client/assets/styles/global.css' && false) {
        let engineTheme = fs.readFileSync(dirStyle, viewMetaData.charset);
        defaultTheme.map(color => engineTheme = replaceAll(engineTheme, color, randomColor()));
        return engineTheme;
    }
    return fs.readFileSync(dirStyle, viewMetaData.charset);
};

const renderComponents = () => viewPaths.map(path =>/*html*/`
<${path.component}>${this[path.options ? path.options.origin : path.component].init(path.options)}</${path.component}>
`).join('');

const renderView = dataView => {
    const { view, viewMetaData, viewPaths } = dataView;
    let jsClientCore = `(function(){

        const version = '${process.env.npm_package_version}';
        const viewPaths = JSON.parse('${JSON.stringify(viewPaths.filter(path => path.render))}');
        const view = JSON.parse('${JSON.stringify(view)}');
        const viewMetaData = JSON.parse('${JSON.stringify(viewMetaData)}');
        const maxIdComponent = 50;
        const errorIcon = ${/*html*/"`<i class='fa fa-exclamation-triangle' aria-hidden='true'></i>`"};
        const sucessIcon = ${/*html*/"`<i class='fa fa-check-circle' aria-hidden='true'></i>`"};
        const renderComponents = ${renderComponents};
        const topLabelInput = '35px';
        const botLabelInput = '0px';
        const banner = ${dataView.banner ? dataView.banner : `() => ''`};
        const botDescription = ${dataView.botDescription ? dataView.botDescription : `() => ''`};

        ${commonFunctions()}
        ${fs.readFileSync('./src/client/core/vanilla.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/input.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/session.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/render.js', viewMetaData.charset)}
        
        const GLOBAL = this;
        
        ${viewMetaData.apiURIS.map(dataApiUri => `
            const ${dataApiUri.name} = '${dataApiUri.path}';
        `).join('')}
        
        const dev =  ${process.env.NODE_ENV != 'development' ? 'false' : 'true'};
        if(!dev){
            console.log = () => null;
            console.error = () => null;
            console.warn = () => null;
        }
        
        console.log('dataView', view, viewPaths);
        ${viewPaths.filter(path => path.render).map(path =>
        path.options && path.options.origin ? '' :
            fs.existsSync(`./src/client/core/${path.component}.js`) ?
                fs.readFileSync(`./src/client/core/${path.component}.js`) :
                fs.readFileSync(`./src/client/components/${path.component}.js`)
    ).join('')}
        ${fs.readFileSync('./src/client/core/init-render.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/router.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/footer.js', viewMetaData.charset)}
        ${fs.readFileSync('./src/client/core/keys.js', viewMetaData.charset)}
        
        GLOBAL['auth'] = false;

    })()`;
    if (process.env.NODE_ENV != 'development') jsClientCore = UglifyJS.minify(jsClientCore).code;
    const renderTitle = (view.title[viewMetaData.lang] != '' ? view.title[viewMetaData.lang] + ' - ' : '') + viewMetaData.mainTitle;
    const renderDescription = view.description ? view.description[viewMetaData.lang] :
        viewMetaData.description ? viewMetaData.description[viewMetaData.lang] : 'underpost.net engine app';
    const renderSocialImg = view.socialImg ? `<meta property='og:image' content='${view.socialImg}'>` :
        viewMetaData.socialImg ? `<meta property='og:image' content='${viewMetaData.socialImg}'>` : '';
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
            <meta name='author' content='${process.env.npm_package_author}'>

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
            <meta name='msapplication-TileImage' content='${viewMetaData.themeIcons.path}/mstile-144x144.png'>
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
        </head>
        <body>                  
            <script>
                ${process.env.NODE_ENV == 'development' ? jsClientCore : UglifyJS.minify(jsClientCore).code}
            </script>
        </body>
    </html>

`;
};

const ssr = (app, renderData) => {
    const banner = renderData[0].banner;
    const botDescription = renderData[0].botDescription;
    renderData = newInstance(renderData);

    let { viewPaths, baseHome, viewMetaData } = renderData[0];

    renderData.map((renderSingle, i) => {
        if (i > 0) {
            const mergeModule = renderSingle.viewPaths;
            mergeModule.shift();
            viewPaths = viewPaths.concat(mergeModule.map(mergeFix => {
                mergeFix.homePaths.push(viewPaths[0].path);
                mergeFix.path = mergeFix.path.replace(renderSingle.baseHome, baseHome);
                return mergeFix;
            }));
            viewMetaData.apiURIS = viewMetaData.apiURIS.concat(renderSingle.viewMetaData.apiURIS);
        }
    });
    renderData[0].viewPaths = viewPaths;
    renderData[0].viewMetaData = viewMetaData;
    renderData[0].banner = banner;
    renderData[0].botDescription = botDescription;

    let sitemap = '';


    const renders = viewPaths.filter(view => view.render).map(view => {
        if (view.sitemap !== false)
            sitemap += buildLocSitemap(view, viewMetaData);

        return {
            path: view.path,
            render: renderView({
                view,
                ...renderData[0]
            })
        };
    });

    renders.map(view => app.get(view.path,
        (req, res) => {
            res.setHeader('Content-Type', 'text/html');
            logger.info(parser(req.headers['user-agent']));
            return res.status(200).end(view.render);
        }));


    renderSitemap(app, sitemap, viewMetaData);

    const baseStaticUri = process.env.NODE_ENV != 'development' ? '/' + viewMetaData.clientID : '';
    app.use(baseStaticUri + '/assets', express.static(`./src/client/assets`));
    app.use(baseStaticUri + '/.well-known', express.static(`./src/.well-known`));
    app.use(baseStaticUri + '/fontawesome', express.static(`./node_modules/@fortawesome/fontawesome-free/css`));
    app.use(baseStaticUri + '/webfonts', express.static(`./node_modules/@fortawesome/fontawesome-free/webfonts`));
    app.use(baseStaticUri + '/tinymce', express.static('./node_modules/tinymce'));
    app.use(baseStaticUri + '/simplemde', express.static('./node_modules/simplemde/dist'));
    app.use(baseStaticUri + '/marked', express.static('./node_modules/marked'));
    app.use(baseStaticUri + '/spectre-markdown.css', express.static('./node_modules/spectre-markdown.css'));
    app.use(baseStaticUri + '/assets-underpost', express.static('./underpost_modules/underpost-library/assets'));
    app.use(baseStaticUri + '/xml', express.static(`./underpost_modules/underpost-library/xml`));

    const sourceVanillaJs =
        UglifyJS.minify(
            commonFunctions() +
            fs.readFileSync('./src/client/core/vanilla.js', 'utf-8')
        ).code;
    app.get(baseStaticUri + '/vanilla.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        // process.env.NODE_ENV == 'development' ? jsClientCore : UglifyJS.minify(jsClientCore).code
        return res.end(sourceVanillaJs);
    });

    app.get(baseStaticUri + '/base.css', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('text/css; charset= charset=utf-8')
        });
        return res.end(cssClientCore);
    });

    const baseStaticClient = process.env.NODE_ENV == 'development' ? '/' + viewMetaData.clientID : '';
    robotstxt({
        policy: [
            // {
            //     userAgent: "Googlebot",
            //     allow: "/",
            //     disallow: "/search",
            //     crawlDelay: 2,
            // },
            // {
            //     userAgent: "OtherBot",
            //     allow: ["/allow-for-all-bots", "/allow-only-for-other-bot"],
            //     disallow: ["/admin", "/login"],
            //     crawlDelay: 2,
            // },
            // {
            //     userAgent: "*",
            //     allow: "/",
            //     disallow: "/search",
            //     crawlDelay: 10,
            //     cleanParam: "ref /articles/",
            // },
        ],
        sitemap: `${buildURL(viewMetaData)}${baseStaticClient}/sitemap.xml`,
        host: `${buildURL(viewMetaData)}${baseStaticClient}`,
    })
        .then((content) => {
            // console.log(content);
            app.get(`/${viewMetaData.clientID}/robots.txt`, (req, res) => {
                res.writeHead(200, {
                    'Content-Type': ('text/plain; charset=utf-8')
                });
                return res.end(content);
            });
        })
        .catch((error) => {
            throw error;
        });
};

const getBaseComponent = (baseHome, component) => {
    return {
        path: baseHome + `/${getHash()}`,
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