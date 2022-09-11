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
                         <br>
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
                                    'X-RapidAPI-Key': '25b3afc506mshfa5e24eafc7228cp1b1218jsn486af35e48f6',
                                    'X-RapidAPI-Host': 'youtube-mp3-download1.p.rapidapi.com',
                                },
                                // body: JSON.stringify([userNameUriValue])
                            });

                    console.log('publicDataRequest', publicDataRequest);
                    if (publicDataRequest.status == 'processing')
                        setTimeout(async () => await execDowload(), 3000);
                    else {

                        fadeIn(s('.' + this[IDS][5]));

                        if (publicDataRequest.codeStatus == 401 || publicDataRequest.status == 'fail') {
                            s(this[IDS][4]).style.display = 'none';
                            return append('body', renderFixModal({
                                id: 'mini-modal-' + s4(),
                                icon: errorIcon,
                                color: 'red',
                                content: publicDataRequest.message || publicDataRequest.msg
                            }));
                        }


                        // window.open(publicDataRequest.link, '_blank');
                        htmls(this[IDS][4], /*html*/`
                            <div class='in container title' style='text-align: center; padding: 30px'>                        
                                ${renderLang({ en: 'Proceso Finalizado', en: 'Completed Processes' })}
                                <br><br>
                                <span style='font-size: 30px; color: green;'>${sucessIcon}</span>
                                <br><br>
                                <a target='_blank' href='${publicDataRequest.link}'>                        
                                    <span style='font-size: 10px'>[${publicDataRequest.title}]</span>
                                    <br>
                                    ${renderLang({ es: 'Iniciar Descarga', en: 'Start Download' })}
                                </a> 
                            </div>
                    `);


                    }
                };

                await execDowload();


            };
        });

        // 
        return /*html*/`

       <div class='in container title' style='text-align: center'>
            YouTube MP3 downloader
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