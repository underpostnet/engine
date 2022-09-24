

this.audio_stream = {
    init: function () {

        this.mainContainer = 'x' + s4();

        setTimeout(async () => {

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
                    // file: buildBaseApiUri() + newInstance(x),
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

                return /*html*/`
                <div class='in main-card'>
                    ${dataAudio.title}
                </div>
                
                `
            }).join(''));

        });

        return /*html*/`
            <div class='in container ${this.mainContainer}'>
                    ${renderSpinner(`x${s4()}`, { style: 'display: block; text-align: center' })}
            </div>
        <!--
            <audio controls>
                <source src="horse.ogg" type="audio/ogg">
                <source src="horse.mp3" type="audio/mpeg">
                Your browser does not support the audio tag.
            </audio>
        -->
           
        `
    }
};