// external links modules router
setTimeout(() => {
    append('post_menu_container', /*html*/`
            <button onclick='location.href="/en/vanilla-js-gallery"' >vanilla js gallery</button>
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




