
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

            htmls('search-yt-content', /*html*/`
            <div class='in container title'>
                ${renderLang({ es: `Resultados para: <i>${searchTerm}</i>`, en: `Results for: <i>${searchTerm}</i>` })}
            </div>
            <div class='in container'>
                    ${publicDataRequest.contents.map(dataMedia => {
                const ytUrl = `https://www.youtube.com/watch?v=${dataMedia.video.videoId}`;
                const idClickCard = 'x' + s4();
                const idCopyYtLink = 'x' + s4();

                setTimeout(() => {
                    s('.' + idClickCard).onclick = () => htmls('player-yt-content', /*html*/`
                    <iframe 
                        width='100%'
                        height='415'
                        src='https://www.youtube.com/embed/${dataMedia.video.videoId}'
                        frameborder='0' 
                        allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture' 
                        allowfullscreen='true'>
                    </iframe>
                    `);
                    s('.' + idCopyYtLink).onclick = () => alert();
                });

                return /*html*/`                        
                    <div class='in yt-card'>
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
            }

            s('.' + this[IDS][3]).onclick = e => {
                e.preventDefault();
                const valueSearchYt = s('.' + this[IDS][1]).value;
                console.log('valueSearchYt', valueSearchYt);
                if (valueSearchYt == '') return;
            };

        });


        return /*html*/`
        <style>
            .yt-card {
                padding: 5px;
                margin: 5px;
                transition: .3s;
                background: #0d0d0d;
            }
            .yt-card:hover {
                background: #1a1a1a;
            }
        </style>
        <form class='in container'>
                    ${renderInput(this[IDS], renderLang({ es: `Buscar`, en: `Search` }), [0, 1, 2])}        
                    <button type='submit' class='${this[IDS][3]}'>
                        <i class='fas fa-search'></i>
                    </button>
        </form> 
        <player-yt-content></player-yt-content>
        <search-yt-content></search-yt-content>
        `
    }
};