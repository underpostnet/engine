

this.legacy_gallery = {
    dataGallery: [

        { name: '3D PLOT DEMO', link: 'underpost.net/3dplotdemo' },

        { name: 'PATH FINDING', link: 'underpost.net/pathfinding' },

        { name: 'SURVIVAL BALL GAME', link: 'underpost.net/survival' },

        // { name: 'OLD CYBERIA', link: 'underpost.net/old-cyberia' },

        { name: 'INFINITE LEVELS LABYRYNTH', link: 'underpost.net/laberinto' },

        { name: 'VIRTUAL ROLL DICE', link: 'underpost.net/dice' },

        { name: 'FRIENDLY BACKLINK GENERATOR', link: 'underpost.net/back' },

        { name: 'BOT VIRTUAL WORLD', link: 'underpost.net/bots' },

        { name: 'CELLULAR AUTOMATA SIMULATOR', link: 'underpost.net/life' }

    ],
    init: function () {

        this.contentMenuLegacy = 'x' + s4();
        this.contentIframeDisplay = 'x' + s4();

        return /*html*/`
        <style>
        .iframe-legacy-gallery {
            border: none;
            width: 98%;
            margin: auto;
            height: 500px;
        }    
        </style>
        <${this.contentIframeDisplay}></${this.contentIframeDisplay}>
        <${this.contentMenuLegacy}>
                    `+ this.dataGallery.map(dataItem => {
            const id = 'x' + s4();
            const idBackGallery = 'x' + s4();
            setTimeout(() => s('.' + id).onclick = () => {

                s(this.contentMenuLegacy).style.display = 'none';
                htmls(this.contentIframeDisplay, /*html*/`
                   <div class='in container'>
                        <button class='${idBackGallery}'>${renderLang({ es: 'Volver a la galeria', en: 'Back to gallery' })}</button>
                        <br><br>
                        <iframe class='in iframe-legacy-gallery' src='https://${dataItem.link}'></iframe>
                   </div>
                `);
                fadeIn(s(this.contentIframeDisplay));
                s('.' + idBackGallery).onclick = () => {
                    s(this.contentIframeDisplay).style.display = 'none';
                    fadeIn(s(this.contentMenuLegacy));
                };

            });
            return /*html*/`
                        <div class='in container'>
                            <button class='${id}'>${dataItem.name}</button>
                        </div>
                        `;
        }).join('') + /*html*/`
        </${this.contentMenuLegacy}>
        `

    }
};