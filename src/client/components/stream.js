


this.stream = {
    init: function () {




        this.audioElementId = 'x' + s4();
        this.audioReceptorElement = 'x' + s4();
        this.streamEmiter = false;

        const ioSocket = io('/');
        const peerInstance = new Peer(undefined, {
            host: '/',
            port: 5501
        });

        peerInstance.on('open', id => {

            console.warn('peerInstance | open', id);

            ioSocket.emit('join-room', 0, id, 1); // id room , id peer, id type

            s('.' + this.audioElementId).onplay = () => {
                this.streamEmiter = true;
                peerInstance.call(id, s('.' + this.audioElementId).captureStream());
            };

        });


        peerInstance.on('call', call => {
            call.answer(new MediaStream());

            call.on('stream', stream => {

                if (!this.streamEmiter) {
                    s('.' + this.audioReceptorElement).srcObject = stream;
                    s('.' + this.audioReceptorElement).play();
                }


            });

        });

        peerInstance.on('disconnected', () => {

            console.log('peerInstance | disconnect');

        });

        ioSocket.on('receiver-connected', id => {

            console.warn('ioSocket | receiver-connected', id);


        });

        ioSocket.on('disconnect', () => {

            console.log('ioSocket | disconnect');

        });





        return /*html*/`
            <div class='in container'>
                <audio controls class='${this.audioElementId}'>
                    <source 
                        src="/uploads/cloud/francisco-verdugo/f955e-Carpenter-Brut-Leather-Teeth-Accelerated_pFGI5UMlIRQ.mp3" 
                        type="audio/mpeg">
                </audio>
            </div>
            
            <div class='in container'>
                <audio controls class='${this.audioReceptorElement}'></audio>
            </div>
        
        `
    }
};