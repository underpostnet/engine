this.boards = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'boards-' + s4());


        return /*html*/`

        <div class='${this[IDS][0]}'>

        </div>
        
        `
    },
    routerDisplay: async function (options) {


        const idRender = '.' + this[this.IDS][0];

        const saveInstanceUri = () => {
            // que exista la ruta con el parametro y que no exista el nuevo
            let viewTemplate = viewPaths.find(x => x.path.split('/').pop() == ':username');
            if (viewTemplate && !viewPaths.find(x => x.path.split('/').pop() == getURI().split('/').pop())) {
                viewTemplate = newInstance(viewTemplate);
                viewTemplate.menu = false;
                viewTemplate.path = viewTemplate.path.replace(':username', getURI().split('/').pop());
                if (viewTemplate.path.split('/').pop() != 'boards') viewPaths.push(viewTemplate);
            }
        };


        const valueParam = localStorage.getItem('username');


        let publicDataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/public`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // options && options.newPath ? [options.newPath] :  para reset volver click boards
            body: JSON.stringify([getURI().split('/').pop()])
        });

        // console.log(valueParam == localStorage.getItem(GLOBAL['lastTestEvalPath'].split('/').pop().split(':')[1]));
        // console.log(valueParam != clearURI(getURI()).split('/').pop());
        // console.log(publicDataRequest.data.validateUser === false);
        // options

        if (
            validateSession()
            &&
            // valueParam == clearURI(getURI()).split('/').pop()
            (
                (
                    valueParam == localStorage.getItem(GLOBAL['lastTestEvalPath'].split('/').pop().split(':')[1])
                    &&
                    options
                    // valueParam != clearURI(getURI()).split('/').pop()
                    // &&
                    // publicDataRequest.data.validateUser
                )
                ||
                valueParam == clearURI(getURI()).split('/').pop()
            )
        ) {
            const displayParam = cap(valueParam.replaceAll('-', ' '));
            const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}`, {
                headers: {
                    'Authorization': renderAuthBearer()
                }
            });

            //  agregar opcion ver todos
            publicDataRequest.data.validateUser = true;

            if (clearURI(getURI()).split('/').pop() != valueParam)
                setURI(`${buildBaseUri()}/${valueParam}`);

            htmls('title', renderLang({ es: `${displayParam} - Board`, en: `${displayParam} - Board` }));

            htmls(idRender, /*html*/`
            ${await this.renderBoards(requestResult.data)}
            <!--
        <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        -->
        `);
        } else {
            if (clearURI(getURI()).split('/').pop() != 'boards' && publicDataRequest.data.validateUser === false)
                setURI(`${buildBaseUri()}/boards`);

            htmls('title', publicDataRequest.data.result.length != 1 ?
                renderLang({ es: `Boards - ${viewMetaData.host}`, en: `Boards - ${viewMetaData.host}` }) :
                renderLang({
                    es: `${cap(publicDataRequest.data.result[0].username.replaceAll('-', ' '))} - Board`,
                    en: `${cap(publicDataRequest.data.result[0].username.replaceAll('-', ' '))} - Board`
                }));
            htmls(idRender, /*html*/`
            ${await this.renderBoards(publicDataRequest.data.result)}
            <!--
        <pre><code> public board(s) 
        ${JSON.stringify(publicDataRequest.data.result, null, 4)}</code></pre>
        -->
        `);
        }
        saveInstanceUri();
        fadeIn(s('boards'));
        if (publicDataRequest.data.validateUser === true) {
            prepend(idRender, /*html*/`

            <div class='in container'>
                <button class='${this[this.IDS][1]}'>
                ${renderLang({ es: `Ver Últimos tableros Públicos`, en: `View Latest Public Boards` })}
                </button>
            </div>
            
            `);
            s('.' + this[this.IDS][1]).onclick = () => {
                GLOBAL.router({ newPath: `${buildBaseUri()}/boards` });
            };
        }


    },
    closeSession: function () {
        // this.routerDisplay();
    },
    renderBoards: async dataBoards => {
        let render = '';
        for (let dataBoard of dataBoards) {
            for (let contentDataRender of dataBoard.markdown.concat(dataBoard.editor).concat(dataBoard['js-demo'])) {
                const renderSingleContent = await GLOBAL.view_content.renderViewContent({
                    ...contentDataRender,
                    username: dataBoard.username
                }, 1000);
                render += renderSingleContent;
            }
        }
        return render;
    }
};