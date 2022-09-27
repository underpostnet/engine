

this.audio_stream = {
    users: [],
    idAudios: [],
    init: function () {

        this.mainContainer = 'x' + s4();
        this.audioEmiter = 'x' + s4();
        this.audioSrc = 'x' + s4();
        this.titleContainer = 'x' + s4();
        this.users = [];
        this.idAudios = [];

        setTimeout(async () => {

            if (!GLOBAL['auth'] || localStorage.getItem('username') != 'francisco-verdugo') {
                htmls('.' + this.mainContainer, '');
                return;
            }

            const ROOM_ID = 'test-room';
            GLOBAL.audio_stream.socket = io('http://localhost:5501'); // Create our socket
            GLOBAL.audio_stream.myPeer = new Peer(); // Creating a peer element which represents the current user

            GLOBAL.audio_stream.myPeer.on('open', id => { // When we first open the app, have us join a room
                GLOBAL.audio_stream.socket.emit('join-room', ROOM_ID, id);
            });

            GLOBAL.audio_stream.socket
                .on('user-connected', userId => { // If a new user connect
                    if (!this.users.includes(userId)) this.users.push(userId);
                    GLOBAL.audio_stream.myPeer
                        .call(userId, s('.' + this.audioEmiter).captureStream()); // Call the user who just joined
                });


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
                this.idAudios.push(idAudio);
                setTimeout(() => {
                    s('.' + idAudio).onclick = () => {


                        s('.' + this.audioSrc).src = dataAudio.url;
                        s('.' + this.audioEmiter).load(); //call this to just preload the audio without playing
                        s('.' + this.audioEmiter).play(); //call this to play the song right away

                        s('.' + this.audioEmiter).oncanplay = () => {
                            this.users.map(userId => GLOBAL.audio_stream.myPeer
                                .call(userId, s('.' + this.audioEmiter).captureStream()))
                        };

                        htmls('.' + this.titleContainer, dataAudio.title);

                        // if (this.checkTimeAudio) clearInterval(this.checkTimeAudio);
                        // this.checkTimeAudio = setInterval(() => {
                        //     console.log(s('.' + this.audioEmiter).currentTime / s('.' + this.audioEmiter).duration);
                        // }, 1000);

                        s('.' + this.audioEmiter).onended = () => {
                            s('.' + this.idAudios[random(0, (this.idAudios.length - 1))]).click();
                        };


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
            <div class='in container title ${this.titleContainer}'>
                audio player
            </div>
            <div class='in container'>
                <audio controls class='${this.audioEmiter}'>
                    <source type='audio/mpeg' class='${this.audioSrc}'>
                </audio>
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