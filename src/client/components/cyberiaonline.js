this.cyberiaonline = {
    init: function () {



        setTimeout(() => {

            const CYBERIAONLINE = { ...ssrCYBERIAONLINE };
            const { maxRangeMap, amplitudeRangeMap } = CYBERIAONLINE;
            CYBERIAONLINE.app = new PIXI.Application({
                width: maxRangeMap * amplitudeRangeMap,
                height: maxRangeMap * amplitudeRangeMap,
                background: 'gray'
            });
            const { app, elements } = CYBERIAONLINE;

            s('pixi-container').appendChild(app.view);

            CYBERIAONLINE.elements = elements.map(element => {

                const {
                    x,
                    y,
                    dim,
                    color,
                } = element;

                element.pixi = {};

                element.pixi.container = new PIXI.Container();
                element.pixi.container.x = x;
                element.pixi.container.y = y;
                element.pixi.container.width = dim;
                element.pixi.container.height = dim;
                app.stage.addChild(element.pixi.container);

                element.pixi.background = new PIXI.Sprite(PIXI.Texture.WHITE);
                element.pixi.background.x = 0;
                element.pixi.background.y = 0;
                element.pixi.background.width = dim;
                element.pixi.background.height = dim;
                element.pixi.background.tint = color;
                element.pixi.container.addChild(element.pixi.background);

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