import { baseStaticUri } from '../../api/util.js';
import fs from 'fs';

const clientID = 'media';
const viewMetaData = {
    clientID,
    mainTitle: 'Underpost Media',
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
    ]
};

const baseHome = '/' + clientID;

const statics = app => {

    const BSU = baseStaticUri(viewMetaData);

    const cssAudioPlayer = fs.readFileSync('./underpost_modules/underpost-library/audioplayer/AudioPlayer.css', 'utf-8');
    app.get(BSU + '/audioplayer/AudioPlayer.css', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('text/css; charset= charset=utf-8')
        });
        return res.end(cssAudioPlayer);
    });

    const jsAudioPlayer = fs.readFileSync('./underpost_modules/underpost-library/audioplayer/AudioPlayer.js', 'utf8');
    app.get(BSU + '/audioplayer/AudioPlayer.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(jsAudioPlayer);
    });

    const srcAudioPlayer = /*html*/`
    <!DOCTYPE html>
    <html >
    <head>
        <meta charset="UTF-8">
        <title>Audio player HTML5</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        <link rel="stylesheet" href="/audioplayer/AudioPlayer.css">
        <style>

        #player{
            position: relative;
            max-width: 700px;
            height: 500px;
            border: solid 1px gray;
        }
        </style>
    </head>

    <body>
        <!-- Audio player container-->
        <div id='player'></div>

        <!-- Audio player js begin-->
        <script src="/audioplayer/AudioPlayer.js"></script>

        <script>
            // test image for web notifications
            const iconImage = null;

            AP.init({
                container:'#player',//a string containing one CSS selector
                volume   : 0.7,
                autoPlay : true,
                notification: false,
                playList: [
                    { 'icon': iconImage, 'title': 'imecop1983-Reflections-Album-Bonus-OST', 'file': '/uploads/cloud/francisco-verdugo/f7ec1.mp3' },
                    { 'icon': iconImage, 'title': 'imecop1983-Reflections-Album-Bonus-OST', 'file': '/uploads/cloud/francisco-verdugo/f7ec1.mp3' }
            ]
            });
        </script>
        <!-- Audio player js end-->

    </body>
    </html>        
    `;

    app.get(BSU + '/audioplayer', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('text/html; charset=utf-8')
        });
        return res.end(srcAudioPlayer);
    });

    if (process.argv[2] == 'build') {        
        fs.mkdirSync(`./builds/${viewMetaData.clientID}/audioplayer`);
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/audioplayer/AudioPlayer.js`, jsAudioPlayer, 'utf8');
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/audioplayer/AudioPlayer.css`, cssAudioPlayer, 'utf8');
        fs.writeFileSync(`./builds/${viewMetaData.clientID}/audioplayer/index.html`, srcAudioPlayer, 'utf8');
    }

}

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
        path: baseHome + '/audioplayer',
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
    }
];


const media = {
    viewMetaData,
    viewPaths,
    baseHome,
    statics
};

export { media };