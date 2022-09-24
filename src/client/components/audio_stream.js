

this.audio_stream = {
    init: function () {

        this.mainContainer = 'x' + s4();
        this.audioEmiter = 'x' + s4();

        setTimeout(async () => {

            if (!GLOBAL['auth']) {
                htmls('.' + this.mainContainer, '');
                return;
            }

            const dataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/uploader/files/mp3`, {
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

            const audioList = dataRequest.data.map(x => {
                return {
                    url: buildBaseApiUri() + newInstance(x),
                    title: x.split('/').pop()
                        .slice(6)
                        .split('.')[0]
                        .split('_')[0]
                        .replaceAll('-', ' ')
                        .replaceAll('_', ' ')
                }
            });

            console.log('dataAudio', audioList);

            htmls(`.${this.mainContainer}`, audioList.map(dataAudio => {

                const idAudio = 'x' + s4();
                setTimeout(() => {
                    s('.' + idAudio).onclick = () => {
                        const audioPlayerId = 'x' + s4();
                        htmls('.' + this.audioEmiter, /*html*/`
                        <audio class='${audioPlayerId}' controls>
                             <source src='${dataAudio.url}' type='audio/mpeg'>
                        </audio>
                        `);
                        s('.' + audioPlayerId).play();
                        // .srcObject = stream
                        // s('.' + this.audioEmiter).captureStream();

                    };
                });
                return /*html*/`
                <div class='in main-card ${idAudio}' style='cursor: pointer'>
                    ${dataAudio.title}
                </div>
                `
            }).join(''));

        });

        return /*html*/`
            <div class='in container ${this.audioEmiter}'>
                <audio controls></audio>
            </div>
            <div class='in container ${this.mainContainer}'>
                    ${renderSpinner(`x${s4()}`, { style: 'display: block; text-align: center' })}
            </div>
           
        `
    },
    startSession: function () {
        htmls('audio_stream', this.init());
    }
};