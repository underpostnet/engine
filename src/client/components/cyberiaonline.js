this.cyberiaonline = {
    init: function () {



        setTimeout(() => {

            const amplitudeRender = 13;
            const CYBERIAONLINE = { ...ssrCYBERIAONLINE };
            const { maxRangeMap } = CYBERIAONLINE;

            CYBERIAONLINE.app = new PIXI.Application({
                width: maxRangeMap * amplitudeRender,
                height: maxRangeMap * amplitudeRender,
                background: 'gray'
            });

            const { app, elements } = CYBERIAONLINE;

            const setAmplitudeRender = render => {
                Object.keys(render).map(keyRender => {
                    render[keyRender] = render[keyRender] * amplitudeRender;
                });
                return render;
            }

            s('pixi-container').appendChild(app.view);

            CYBERIAONLINE.elements = elements.map(element => {

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
            });
            console.log('CYBERIAONLINE', CYBERIAONLINE);

        });




        return /*html*/`
        
        
        
        <div class='in container'>

                     <pixi-container class='in'></pixi-container>

        </div>
        
        
        
        `
    }
};