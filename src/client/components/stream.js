


this.stream = {
    init: function () {




        this.audioElementId = 'x' + s4();

        const ioSocket = io('/');
        const peerInstance = new Peer(undefined, {
            host: '/',
            port: 5501
        });

        peerInstance.on('open', id => {

            console.warn('peerInstance | open', id);

            ioSocket.emit('join-room', 0, id, 1); // id room , id peer, id type

            // peerInstance.call(id, s('.'+this.audioElementId).captureStream());

        });


        peerInstance.on('call', call => {
            call.answer(new MediaStream());

            call.on('stream', stream => {

                // .srcObject = stream;
                // .play();


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
                Stream module
            </div>
        
        `
    }
};