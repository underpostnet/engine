

const uriApi = '';


this.vanilla_js = {

    init: function () {

        return /*html*/`
            <div class='in container'>
                    
                    vanilla js
            
            </div>
        `
    }

};

append('body', renderComponents());

// external links modules router
setTimeout(() => {
    append('pre_menu_container', /*html*/`
        <button onclick='location.href="/editor"' >editor</button>
        <button onclick='location.href="/markdown"' >markdown</button>
    `);
});



