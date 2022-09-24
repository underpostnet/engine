
this.yt_player = {
    init: function () {


        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'yt_player-' + s4());

        // https://rapidapi.com/Glavier/api/youtube138/

        const ytSearch = async searchTerm => {
            let publicDataRequest =
                await serviceRequest(
                    () => `https://youtube138.p.rapidapi.com/search/?q=${searchTerm}`, // &hl=en&gl=US
                    {
                        method: 'GET',
                        headers: {
                            'X-RapidAPI-Key': '25b3afc506mshfa5e24eafc7228cp1b1218jsn486af35e48f6',
                            'X-RapidAPI-Host': 'youtube138.p.rapidapi.com'
                        }
                    });

            console.warn('ytSearch publicDataRequest', publicDataRequest);

            s('.' + this[IDS][4]).style.display = 'none';
            fadeIn(s('.' + this[IDS][5]));

            htmls('search-yt-content', /*html*/`
            <div class='in container title'>
                ${renderLang({ es: `Resultados para: <i>${searchTerm}</i>`, en: `Results for: <i>${searchTerm}</i>` })}
            </div>
            <div class='in container'>
                    ${publicDataRequest.contents.map(dataMedia => {
                console.log('dataMedia', dataMedia);
                if (dataMedia.type != 'video') return '';
                const ytUrl = `https://www.youtube.com/watch?v=${dataMedia.video.videoId}`;
                const idClickCard = 'x' + s4();
                const idCopyYtLink = 'x' + s4();

                setTimeout(() => {
                    s('.' + idClickCard).onclick = () => htmls('player-yt-content', /*html*/`
                  <div class='in container'>
                    <iframe 
                        width='100%'
                        height='415'
                        src='https://www.youtube.com/embed/${dataMedia.video.videoId}'
                        frameborder='0' 
                        allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture' 
                        allowfullscreen='true'>
                    </iframe>
                  </div>
                    `);
                    s('.' + idCopyYtLink).onclick = async () => {
                        await copyData(ytUrl);
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Contenido Copiado al Portapapeles', en: 'Copy to Clipboard' })
                        }));
                    };
                });

                return /*html*/`                        
                    <div class='in main-card'>
                        <div class='in ${idClickCard}' style='
                        margin: auto; 
                        padding: 10px; 
                        font-size: 20px;
                        cursor: pointer;
                        '>
                                ${dataMedia.video.title}
                                <br><br>
                                <img src='${dataMedia.video.thumbnails[0].url}' style='width: 300px'>
                        </div>
                        <!--
                        <i class='fas fa-link'></i>
                        <i class='fa-brands fa-youtube'></i>
                        -->
                        <button class='${idCopyYtLink}'> 
                            <i class='fas fa-copy'></i>
                            <span style='font-size: 10px'>${ytUrl}</span> 
                        </button>
                    </div>
                        `
            }).join('')}
            </div>
            `);
        };

        setTimeout(() => {
            if (GLOBAL['currentComponent'] == 'yt_player'
                && getQueryParams().s
                && getQueryParams().s != '') {
                ytSearch(getQueryParams().s);
            } else if (GLOBAL['yt-search']) {
                ytSearch(newInstance(GLOBAL['yt-search']));
                const querySearchUri = location.pathname + '?s=' + GLOBAL['yt-search'];
                if ((getURI() + location.search) != querySearchUri)
                    setURI(querySearchUri);
                GLOBAL['yt-search'] = undefined;

            }

            s('.' + this[IDS][3]).onclick = e => {
                e.preventDefault();
                const valueSearchYt = s('.' + this[IDS][1]).value;
                console.log('valueSearchYt', valueSearchYt);
                if (valueSearchYt == '') return;

                s('.' + this[IDS][5]).style.display = 'none';
                fadeIn(s('.' + this[IDS][4]));

                const querySearchUri = location.pathname + '?s=' + valueSearchYt;
                if ((getURI() + location.search) != querySearchUri)
                    setURI(querySearchUri);

                ytSearch(valueSearchYt);

            };

        });


        return /*html*/`
        <player-yt-content></player-yt-content>
        ${renderSpinner(this[IDS][4])}
        <form class='in container ${this[IDS][5]}'>
                    ${renderInput(this[IDS], renderLang({ es: `Buscar`, en: `Search` }), [0, 1, 2])}        
                    <button type='submit' class='${this[IDS][3]}'>
                        <i class='fas fa-search'></i>
                    </button>
        </form> 
        <search-yt-content>
             ${(getQueryParams().s && getQueryParams().s != '') ||
                GLOBAL['yt-search'] ?
                renderSpinner(`x${s4()}`, { style: 'display: block; text-align: center' }) :
                ''
            }
        </search-yt-content>
    `
    },
    routerDisplay: function (options) {
        if (GLOBAL['yt-search']) {
            htmls('yt_player', this.init())
        }
    }
};