

this.pixi = {

    init: function () {

        // https://pixijs.io/examples
        // https://pixijs.download/release/docs/index.html
        // https://www.w3schools.com/colors/colors_picker.asp

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
            // container.width = app.screen.width * 0.3;
            // container.height = app.screen.width * 0.3;
            container.width = 200;
            container.height = 200;

            const backgroundSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            backgroundSprite.x = 0;
            backgroundSprite.y = 0;
            backgroundSprite.width = 200;
            backgroundSprite.height = 200;
            container.addChild(backgroundSprite);

            const headCircle = new PIXI.Graphics();
            headCircle.beginFill(0x3333ff);
            headCircle.lineStyle(0);
            headCircle.drawCircle(100, 30, 25); // x,y,radio
            headCircle.endFill();
            headCircle.width = 50;
            headCircle.height = 50;
            container.addChild(headCircle);




            (()=>{
                return;
            const backgroundSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            backgroundSprite.x = 0;
            backgroundSprite.y = 0;
            backgroundSprite.width = app.screen.width * 0.3;
            backgroundSprite.height = app.screen.width * 0.3;
            container.addChild(backgroundSprite);

            const bodySprite = new PIXI.Sprite(PIXI.Texture.WHITE);
            bodySprite.tint = randomNumberColor(); //Change with the solid color
            bodySprite.x = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodySprite.y = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodySprite.width = backgroundSprite.width * 0.5;
            bodySprite.height = backgroundSprite.width * 0.5;
            container.addChild(bodySprite);

            const bodyCircle = new PIXI.Graphics();
            bodyCircle.beginFill(0x3333ff);
            bodyCircle.lineStyle(0);
            const circleXY = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodyCircle.drawCircle(circleXY, circleXY, (backgroundSprite.width * 0.5) / 2);
            bodyCircle.endFill();
            bodyCircle.x = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2);
            bodyCircle.y = backgroundSprite.width / 2 - ((backgroundSprite.width * 0.5) / 2) - (backgroundSprite.width * 0.3 / 2);
            bodyCircle.width = backgroundSprite.width * 0.5;
            bodyCircle.height = backgroundSprite.width * 0.8;
            container.addChild(bodyCircle);
            })()









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