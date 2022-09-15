

this.audioplayer = {
    init: function () {

        this.audioPlayerContainer = 'x' + s4();

        // https://github.com/likev/html5-audio-player

        return /*html*/`
        <style>
            .iframe-audio-player {
                height: 550px; 
                width: 95%; 
                margin: auto;
                background: none;
                padding: 0px;
            }
        </style>
        <div class='in container ${this.audioPlayerContainer}'>
            ${this.renderAudioPlayer()}
        </div>
        
        `
    },
    routerDisplay: function () {
        htmls('.' + this.audioPlayerContainer, this.renderAudioPlayer());
    },
    renderAudioPlayer: () => /*html*/`
    <iframe class='in iframe-audio-player' src='/audioplayer'></iframe>
    `
};