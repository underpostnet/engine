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
    routerDisplay: async function (options) {


        const idRender = '.' + this[this.IDS][0];

        const saveInstanceUri = () => {
            let viewTemplate = viewPaths.find(x => x.path.split('/').pop() == ':username');
            if (viewTemplate && !viewPaths.find(x => x.path.split('/').pop() == getURI().split('/').pop())) {
                viewTemplate = newInstance(viewTemplate);
                viewTemplate.menu = false;
                viewTemplate.path = viewTemplate.path.replace(':username', getURI().split('/').pop());
                viewPaths.push(viewTemplate);
            }
        };


        const uriParam = clearUri(GLOBAL['lastTestEvalPath']).split('/').pop().split(':')[1];
        const valueParam = localStorage.getItem(uriParam);

        if (validateSession() && uriParam == 'username' && valueParam) {
            const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}`, {
                headers: {
                    'Authorization': renderAuthBearer()
                }
            });

            //  agregar opcion ver todos

            setURI(`${buildBaseUri()}/${valueParam}`);
            htmls('title', renderLang({ es: `${cap(valueParam)} - Board`, en: `${cap(valueParam)} - Board` }));

            htmls(idRender, /*html*/`
        <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        `);
        }
        // setURI(`${buildBaseUri()}/boards`);
        // else {

        //     const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/public`, {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type': 'application/json'
        //         },
        //         // options && options.newPath ? [options.newPath] :  para reset volver click boards
        //         body: JSON.stringify([getURI().split('/').pop()])
        //     });

        //     if (requestResult.data.validateUser === false) {
        //         saveInstanceUri();
        //         setURI(`${buildBaseUri()}/boards`);
        //     } else {
        //         //  agregar opcion ver todos
        //     }


        //     htmls(idRender, /*html*/`
        //  <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        // `);
        // }

        // saveInstanceUri();
        fadeIn(s('user'));

    },
    closeSession: function () {
        this.routerDisplay();
    }
};