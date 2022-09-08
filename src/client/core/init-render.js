
// init render

this.init_render = (options) => {
        if (localStorage.getItem('lang')) s('html').lang = localStorage.getItem('lang');
        if (getQueryParams().lang) s('html').lang = getQueryParams().lang;
        htmls('body', /*html*/`
        <top-banner></top-banner>
        <a ${getQueryParams().target == '_blank' ? `target='_blank'` : ''} alt='${viewMetaData.mainTitle}' href='${buildBaseUri()}/' style='text-decoration: none'>
                ${banner() == '' ?/*html*/`
                <div class='in container banner' style='${borderChar(1, 'white')}'>
                        ${viewMetaData.mainTitle}
                </div>
                `: banner()}
        </a>
        ${viewMetaData.description && !viewMetaData.description.hide ? /*html*/`
        <div class='in container simple-desc'>
                ${renderLang(viewMetaData.description)}
        </div>        
        `: ''}
        <modal></modal>
        <main>
                ${renderComponents()}
        </main>
        <!--
          ${renderLang({ es: 'Codigo Fuente', en: 'Source Code' })}
          ${renderLang({ es: 'Desarrollado por', en: 'Developed by' })}
        -->
        ${footer() == '' ?/*html*/`
        <footer class='fl container'>
                <div class='in flr'>
                        <a target='_blank' href='https://github.com/underpostnet/underpost-engine'> 
                        <img src='/assets/common/github.png' class='inl' style='width: 20px; top: 5px'> 
                        <!-- v${version} -->
                        </a>                      
                </div>   
                <div class='in fll'>
                        <img class='inl' style='width: 20px; top: 3px' src='https://www.dogmadual.com/favicon.ico' alt='DOGMADUAL'>
                        <a target='_blank' href='https://www.dogmadual.com/'>DOGMADUAL.com</a>
                </div>     
        </footer>     
        `: footer()}   
`);
        this.router(options);
        setTimeout(() => checkWindowDimension());

};

this.init_render();