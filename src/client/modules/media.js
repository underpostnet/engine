import { commonFunctions, newInstance } from '../../api/util.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

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
    ],
    srcJS: ['/socket.io/socket.io.js', '/peer/peer.min.js']
};

const baseHome = '/' + clientID;

const statics = app => {
    const deployModuleId = 'underpost';
    const BSU = process.env.NODE_ENV == 'development' ? '' : '/' + deployModuleId;

    const cssAudioPlayer = fs.readFileSync('./underpost_modules/underpost-library/audioplayer/AudioPlayer.css', 'utf-8');
    app.get(BSU + '/audioplayer/AudioPlayer.css', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('text/css; charset= charset=utf-8')
        });
        return res.end(cssAudioPlayer);
    });


    const srcSocketIo = fs.readFileSync('./underpost_modules/underpost-library/lib/socket.io.js', 'utf8');
    app.get(BSU + '/socket.io/socket.io.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(srcSocketIo);
    });

    const srcPeerClient = fs.readFileSync('./underpost_modules/underpost-library/lib/peer.min.js', 'utf8');
    app.get(BSU + '/peer/peer.min.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(srcPeerClient);
    });


    const jsAudioPlayer = fs.readFileSync('./underpost_modules/underpost-library/audioplayer/AudioPlayer.js', 'utf8');
    app.get(BSU + '/audioplayer/AudioPlayer.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(jsAudioPlayer);
    });

    const mainJsAudioPlayer = async () => {

        const dataRequest = await serviceRequest(() => `${baseApiUri}/api/uploader/files/mp3`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('_b') ? localStorage.getItem('_b') : ''}`
            }
            // body: JSON.stringify({
            //     newNamePath: value,
            //     path,
            //     data: this.data
            // })
        });

        if (dataRequest.status == 'error' || dataRequest.data.length == 0) return;

        // test image for web notifications
        window.iconAudioPlayerImage = '/assets-underpost/underpost-social.jpg';

        AP.init({
            container: '#player',//a string containing one CSS selector
            volume: 0.7,
            autoPlay: false,
            notification: false,
            playList: [
                // { 'icon': iconAudioPlayerImage, 'title': 'imecop1983-Reflections-Album-Bonus-OST', 'file': '/uploads/cloud/francisco-verdugo/f7ec1.mp3' },
                // { 'icon': iconAudioPlayerImage, 'title': 'imecop1983-Reflections-Album-Bonus-OST', 'file': '/uploads/cloud/francisco-verdugo/f7ec1.mp3' }
            ].concat(dataRequest.data.map(x => {
                return {
                    icon: iconAudioPlayerImage,
                    file: baseApiUri + newInstance(x),
                    title: x.split('/').pop().slice(6)
                }
            }))
        });
    };

    const baseApiUri = process.env.NODE_ENV == 'development' ? '' : process.env.API_URL;
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
            height: 500px;
            overflow: auto !important;
        }
        </style>
    </head>

    <body>
        <!-- Audio player container-->
        <div id='player'></div>

        <!-- Audio player js begin-->
        <script src="/audioplayer/AudioPlayer.js"></script>

        <script>
        (function(){
            const dev =  ${process.env.NODE_ENV == 'development' && process.argv[2] != 'build' ? 'true' : 'false'};
            const build = ${process.argv[2] == 'build'};
            if(!dev){
                console.log = () => null;
                console.error = () => null;
                console.warn = () => null;
            }
            const baseApiUri = '${baseApiUri}';
            ${commonFunctions()}
            ${fs.readFileSync('./src/client/core/vanilla.js', 'utf8')}
            (${mainJsAudioPlayer})();
        })()
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
        if (!fs.existsSync(`./builds/${deployModuleId}/audioplayer`)) fs.mkdirSync(`./builds/${deployModuleId}/audioplayer`);
        fs.writeFileSync(`./builds/${deployModuleId}/audioplayer/AudioPlayer.js`, jsAudioPlayer, 'utf8');
        fs.writeFileSync(`./builds/${deployModuleId}/audioplayer/AudioPlayer.css`, cssAudioPlayer, 'utf8');
        fs.writeFileSync(`./builds/${deployModuleId}/audioplayer/index.html`, srcAudioPlayer, 'utf8');
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
        path: baseHome + '/stream',
        homePaths: [baseHome],
        title: { en: 'Stream', es: 'Stream' },
        component: 'stream',
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
    },
    {
        path: baseHome + '/audio_stream',
        homePaths: [baseHome],
        title: { en: 'Audio Stream', es: 'Audio Stream' },
        component: 'audio_stream',
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