
append('body', /*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
               ${viewMetaData.mainTitle}
        </div>
        <modal></modal>
        <main>
        ${renderComponents()}
        </main>
        <footer>
            <div class='in container' style='text-align: right'>
                Source Code
                <img src='/assets/github.png' class='inl' style='width: 20px; top: 5px'> 
                <a href='https://github.com/underpostnet/underpost-engine'>GitHub</a>
                <br>
                Developed By
                <img src='/assets/underpost.png' class='inl' style='width: 23px; top: 5px; left: 3px'> 
                <a href='https://underpost.net/'>UNDERpost.net</a>
            </div> 
        </footer>
       
        

`);

// external links modules router
setTimeout(() => {
    append('post_menu_container', /*html*/`
            <button onclick='location.href="/en/vanilla-js-gallery"' >vanilla js gallery</button>
    `);
});


