'use strict';

import fs from 'fs';
import parser from 'ua-parser-js';
import UglifyJS from 'uglify-js';
import CleanCSS from 'clean-css';
import { commonFunctions, getHash, newInstance, randomColor, replaceAll } from '../api/util.js';
import { logger } from './logger.js';
import dotenv from 'dotenv';

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
        const banner = ${dataView.banner ? dataView.banner : `() => '${viewMetaData.mainTitle}'`};

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
    return /*html*/`
    <!DOCTYPE html>
    <html dir='${viewMetaData.dir}' lang='${viewMetaData.lang}'>
        <head>
            <meta charset='${viewMetaData.charset}'>
            <title> ${view.title[viewMetaData.lang] != '' ? view.title[viewMetaData.lang] + ' - ' : ''}${viewMetaData.mainTitle} </title>
            <link rel='icon' type='${viewMetaData.favicon.type}' href='${viewMetaData.favicon.path}'>
            <meta name='viewport' content='initial-scale=1.0, maximum-scale=1.0, user-scalable=0'>
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

    

    const renders = viewPaths.filter(view => view.render).map(view => {
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
        display: false
    }
};

export {
    ssr,
    cssClientCore,
    renderView,
    getBaseComponent
};