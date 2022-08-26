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

        // console.error('routerDisplay lastUri', GLOBAL['lastUri']);

        const idRender = '.' + this[this.IDS][0];



        if (validateSession() && getURI().split('/').pop() == localStorage.getItem('username')) {
            const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}`, {
                headers: {
                    'Authorization': renderAuthBearer()
                }
            });

            htmls(idRender, /*html*/`
        <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        `);
        } else {

            const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/public`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify([getURI().split('/').pop()])
            });

            if (requestResult.data.validateUser === false && GLOBAL['lastTestEvalPath'] == `${buildBaseUri()}/:username`)
                setURI(`${buildBaseUri()}/boards`);

            htmls(idRender, /*html*/`
         <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        `);
        }



        let viewTemplate = viewPaths.find(x => x.path.split('/').pop() == ':username');
        if (viewTemplate && !viewPaths.find(x => x.path.split('/').pop() == getURI().split('/').pop())) {
            viewTemplate = newInstance(viewTemplate);
            viewTemplate.menu = false;
            viewTemplate.path = viewTemplate.path.replace(':username', getURI().split('/').pop());
            viewPaths.push(viewTemplate);
        }

        fadeIn(s('user'));

    },
    closeSession: function () {
        this.routerDisplay();
    }
};