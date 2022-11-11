

this.pixi = {

    init: function () {

        // https://pixijs.io/examples
        // https://pixijs.download/release/docs/index.html

        this.pixiContainerId = `pixijs-${s4()}`;

        let app = new PIXI.Application({ width: 640, height: 360, background: 'gray' });
        setTimeout(() => {
            s(this.pixiContainerId).appendChild(app.view);


            /* dev */


            const container = new PIXI.Container();
            app.stage.addChild(container);

            // Move container to the center
            // container.x = (app.screen.width / 2) - ((app.screen.width * 0.3)/2);
            // container.y = (app.screen.height / 2) - ((app.screen.width * 0.3)/2);

            container.x = 0;
            container.y = 0;
            container.width = app.screen.width * 0.3;
            container.height = app.screen.width * 0.3;

            const backgroundSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            backgroundSprite.x = 0;
            backgroundSprite.y = 0;
            backgroundSprite.width = app.screen.width * 0.3;
            backgroundSprite.height = app.screen.width * 0.3;
            container.addChild(backgroundSprite);

            const bodySprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            bodySprite.tint = 0xff0000; //Change with the solid color
            bodySprite.x = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodySprite.y = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodySprite.width = backgroundSprite.width * 0.5;
            bodySprite.height = backgroundSprite.width * 0.5;
            container.addChild(bodySprite);









            /* dev */

        });
        return /*html*/`

        <div class='in container'>

            <${this.pixiContainerId}>
            
            </${this.pixiContainerId}>

        </div>
        
        `
    }

};