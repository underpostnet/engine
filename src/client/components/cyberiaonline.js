this.cyberiaonline = {
    init: function () {



        setTimeout(() => {

            const amplitudeRender = 13;
            const MAIN = { ...ssrMAIN };
            const { maxRangeMap } = MAIN;

            MAIN.app = new PIXI.Application({
                width: maxRangeMap * amplitudeRender,
                height: maxRangeMap * amplitudeRender,
                background: 'gray'
            });

            const { app, elements } = MAIN;

            const setAmplitudeRender = render => {
                Object.keys(render).map(keyRender => {
                    render[keyRender] = render[keyRender] * amplitudeRender;
                });
                return render;
            }

            s('pixi-container').appendChild(app.view);


            console.log('MAIN', MAIN);

            const renderPixiInitElement = element => {

                const { x, y, dim } = setAmplitudeRender(element.render);
                element.color = numberColors[element.color];
                const { color } = element;

                element.pixi = {};

                element.pixi.container = new PIXI.Container();
                const container = element.pixi.container;
                container.x = x;
                container.y = y;
                container.width = dim;
                container.height = dim;
                app.stage.addChild(container);

                element.pixi.background = new PIXI.Sprite(PIXI.Texture.WHITE);
                const background = element.pixi.background;
                background.x = 0;
                background.y = 0;
                background.width = dim;
                background.height = dim;
                background.tint = color;
                container.addChild(background);

                return element;
            };
            const renderPixiEventElement = element => {
                const { x, y } = setAmplitudeRender(element.render);
                const container = element.pixi.container;
                container.x = x;
                container.y = y;
            };

            MAIN.elements.map(element => renderPixiInitElement(element));

            const wsHost = 'ws://localhost:5502';
            const socket = new WebSocket(wsHost);

            socket.onopen = event => {
                console.log(wsHost, 'onopen', event);
            };

            socket.onclose = event => {
                console.log(wsHost, 'onclose', event.data);
            };

            socket.onmessage = event => {
                event.element = JSON.parse(event.data);
                const { id, render } = event.element;
                const element = elements.find(element => element.id === id);
                if (element) {
                    element.render = render;
                    return renderPixiEventElement(element);
                }
                return MAIN.elements.push(renderPixiInitElement(event.element));
            };

        });




        return /*html*/`
        
        
        
        <div class='in container'>

                     <pixi-container class='in'></pixi-container>

        </div>
        
        
        
        `
    }
};