

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
        return this.dataGallery.map(dataItem => {
            const id = 'x' + s4();
            setTimeout(() => s('.' + id).onclick = () => location.href = 'https://' + dataItem.link);
            return /*html*/`
            <div class='in container'>
                <button class='${id}'>${dataItem.name}</button>
            </div>
            `;
        }).join('')

    }
};