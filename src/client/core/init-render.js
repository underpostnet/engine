
// init render

this.init_render = (options) => {
        if (localStorage.getItem('lang')) s('html').lang = localStorage.getItem('lang');
        htmls('body', /*html*/`
        ${banner() == '' ?/*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
                ${viewMetaData.mainTitle}
        </div>
        `: banner()}        
        ${viewMetaData.description ? /*html*/`
        <div class='in container'>
                ${renderLang(viewMetaData.description)}
        </div>        
        `: ''}
        <modal></modal>
        <main>
                ${renderComponents()}
        </main>       
`);
        this.router(options);

};

this.init_render();