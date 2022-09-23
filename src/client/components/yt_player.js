
this.yt_player = {
    init: function () {

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

            htmls('yt_player', /*html*/`
            <div class='in container title'>
                ${renderLang({ es: `Resultados para: <i>${searchTerm}</i>`, en: `Results for: <i>${searchTerm}</i>` })}
            </div>
            <div class='in container'>
                    ${publicDataRequest.contents.map(dataMedia => {
                return /*html*/`                        
                <a target='_blank' href='https://www.youtube.com/watch?v=${dataMedia.video.videoId}'>
                    <div class='in' style='
                    margin: auto; 
                    padding: 10px; 
                    border-bottom: 2px solid ${mainColor};
                    font-size: 20px;
                    '>
                            ${dataMedia.video.title}
                            <br>
                            <img src='${dataMedia.video.thumbnails[0].url}' style='width: 300px'>
                    </div>
                </a>                       
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
        });


        return /*html*/``
    }
};