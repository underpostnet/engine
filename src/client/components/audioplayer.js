

this.audioplayer = {
    init: function () {

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
        <div class='in container'>
            <iframe class='in iframe-audio-player' src='/audioplayer'></iframe>
        </div>
        
        `
    }
};