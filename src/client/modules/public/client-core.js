
// external links modules router
setTimeout(() => {
    append('pre_menu_container', /*html*/`
        <button onclick='location.href="/editor"' >editor</button>
        <button onclick='location.href="/markdown"' >markdown</button>
        <button onclick='location.href="/js-demo"' >js demo</button>
    `);
});

// init render
append('body', /*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
               ${viewMetaData.mainTitle}
        </div>
        <modal></modal>
        <main>
        ${renderComponents()}
        </main>       
`);



