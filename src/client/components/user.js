this.user = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'user-' + s4());


        return /*html*/`

        <div class='in container ${this[IDS][0]}'>

        </div>
        
        `
    },
    routerDisplay: async function () {

        const idRender = '.' + this[this.IDS][0];

        if (!validateSession() || getURI().split('/').pop() != localStorage.getItem('username'))
            return htmls(idRender, /*html*/`
            public user dashboard
        `);

        const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}`, {
            headers: {
                'Authorization': renderAuthBearer()
            }
        });

        htmls(idRender, /*html*/`
        <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        `);
    },
    closeSession: function () {
        this.routerDisplay();
    }
};