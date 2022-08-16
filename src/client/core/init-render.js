
// init render

append('body', /*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
               ${banner()}
        </div>
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