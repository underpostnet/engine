this.cyberiaonline = {
    init: function () {



        setTimeout(() => {

            const CYBERIAONLINE = {
                ...ssrCYBERIAONLINE,
                app: new PIXI.Application({
                    width: ssrCYBERIAONLINE.maxRangeMap * ssrCYBERIAONLINE.amplitudeRangeMap,
                    height: ssrCYBERIAONLINE.maxRangeMap * ssrCYBERIAONLINE.amplitudeRangeMap,
                    background: 'gray'
                })
            };

            s('pixi-container').appendChild(CYBERIAONLINE.app.view);
            // console.log('CYBERIAONLINE', CYBERIAONLINE, numberColors);

        });




        return /*html*/`
        
        
        
        <div class='in container'>

                     <pixi-container class='in'></pixi-container>

        </div>
        
        
        
        `
    }
};