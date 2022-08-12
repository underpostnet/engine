
// init render

append('body', /*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
               ${viewMetaData.mainTitle}
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