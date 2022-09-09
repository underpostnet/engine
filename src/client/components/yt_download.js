this.yt_download = {
    init: function () {

        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'yt_download-' + s4());

        setTimeout(() => {
            s('.' + this[IDS][0]).onclick = async e => {
                e.preventDefault();
                console.log('yt mp3 dowload click', s('.' + this[IDS][2]).value);

                const builIDYoutube = getYouTubeID(s('.' + this[IDS][2]).value);

                if (builIDYoutube === false)
                    return append('body', renderFixModal({
                        id: 'mini-modal-' + s4(),
                        icon: errorIcon,
                        color: 'red',
                        content: renderLang({ es: 'Url de Yotube Invalida', en: 'Invalid YouTube Url' })
                    }));


                // https://rapidapi.com/ytjar/api/youtube-mp3-download1/

                s('.' + this[IDS][5]).style.display = 'none';

                htmls(this[IDS][4], `
                    <div class='in container title' style='text-align: center'>
                         ${renderLang({ en: 'Processing', es: 'Procesando' })}
                         <br>
                         <br>
                            ID:${builIDYoutube}
                         <br>
                         <br>
                    </div>
                    ${renderSpinner(`x${s4()}`, { style: 'display: block; text-align: center' })}
                `);
                fadeIn(s(this[IDS][4]));

                const execDowload = async () => {
                    let publicDataRequest =
                        await serviceRequest(
                            () => `https://youtube-mp3-download1.p.rapidapi.com/dl?id=${builIDYoutube}`,
                            {
                                method: 'GET',
                                headers: {
                                    // 'Content-Type': 'application/json'
                                    'X-RapidAPI-Key': '',
                                    'X-RapidAPI-Host': 'youtube-mp3-download1.p.rapidapi.com',
                                },
                                // body: JSON.stringify([userNameUriValue])
                            });

                    console.log('publicDataRequest', publicDataRequest);
                    if (publicDataRequest.status == 'processing')
                        setTimeout(async () => await execDowload(), 3000);
                    else {

                        s(this[IDS][4]).style.display = 'none';
                        fadeIn(s('.' + this[IDS][5]));

                        if (publicDataRequest.codeStatus == 401)
                            return append('body', renderFixModal({
                                id: 'mini-modal-' + s4(),
                                icon: errorIcon,
                                color: 'red',
                                content: publicDataRequest.message
                            }));

                        window.open(publicDataRequest.link, '_blank');


                    }
                };

                await execDowload();


            };
        });

        // 
        return /*html*/`

       <div class='in container title' style='text-align: center'>
            YouTube MP3 dowloader
       </div>
       
       <${this[IDS][4]}></${this[IDS][4]}>
       
       <form class='in container ${this[IDS][5]}'>
       
            ${renderInput(this[IDS], renderLang({ es: `YouTube Url`, en: `YouTube Url` }), [1, 2, 3], null, {
            valueLength: 999
        })}  
            <button type='submit' class='${this[IDS][0]}'> ${renderLang({ es: 'Descargar Mp3', en: 'Download Mp3' })} </button>

       </form>
        
        `
    }
};