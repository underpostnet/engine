this.user = {
    init: function(){


        return /*html*/`
            <div class='in container'>
                user component
                <br>
                <pathname></pathname>
            </div>
        `
    },
    routerDisplay: () => {
        htmls('pathname', location.pathname);
    }
};