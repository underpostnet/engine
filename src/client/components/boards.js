this.boards = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'boards-' + s4());
        this.timeOutDelay = 1000;


        return /*html*/`

        <div class='${this[IDS][0]}'>

        </div>
        
        `
    },
    routerDisplay: async function (options) {


        const idRender = '.' + this[this.IDS][0];
        const valueParam = localStorage.getItem('username');
        const arrayParamsUri = clearURI(getURI()).split('/');
        const indexConten = arrayParamsUri.indexOf('content');
        const userNameUriValue = indexConten > -1 ? arrayParamsUri[indexConten - 1] : arrayParamsUri.pop();
        const contentNameUriValue = indexConten > -1 ? arrayParamsUri[indexConten + 1] : undefined;

        const saveInstanceUri = () => {
            // que exista la ruta con el parametro y que no exista el nuevo
            let viewTemplate = viewPaths.find(x => x.path.split('/').pop() == ':username');
            const newRenderPath = viewTemplate.path.replace(':username', userNameUriValue)
                + (contentNameUriValue != undefined ? `/content/${contentNameUriValue}` : '');
            if (viewTemplate && !viewPaths.find(x => x.path == newRenderPath || (x.paths && x.paths.includes(newRenderPath)))) {
                viewTemplate = newInstance(viewTemplate);
                viewTemplate.menu = false;
                viewTemplate.paths = [];
                viewTemplate.path = newRenderPath;
                viewTemplate.clone = true;
                viewPaths.push(viewTemplate);
            }
        };


        let publicDataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/public`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // options && options.newPath ? [options.newPath] :  para reset volver click boards
            body: JSON.stringify([userNameUriValue])
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
                    valueParam == localStorage.getItem(userNameUriValue.split(':')[1])
                    &&
                    options
                    // &&
                    // options.newPath == `${buildBaseUri()}/:username`
                    // valueParam != clearURI(getURI()).split('/').pop()
                    // &&
                    // publicDataRequest.data.validateUser
                )
                ||
                valueParam == userNameUriValue
            )
        ) {
            const displayParam = formatUserName(valueParam);
            const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}`, {
                headers: {
                    'Authorization': renderAuthBearer()
                }
            });

            //  agregar opcion ver todos
            publicDataRequest.data.validateUser = true;

            if (userNameUriValue != valueParam)
                setURI(`${buildBaseUri()}/${valueParam}`
                    + (contentNameUriValue != undefined ? `/content/${userNameUriValue}` : ''));

            htmls('title', renderLang({ es: `${displayParam} - Board`, en: `${displayParam} - Board` }));

            htmls(idRender, /*html*/`
            ${await this.renderBoards(requestResult.data, userNameUriValue, contentNameUriValue)}
            <!--
        <pre><code>${JSON.stringify(requestResult.data, null, 4)}</code></pre>
        -->
        `);
        } else {
            if (userNameUriValue != 'boards' && clearURI(getURI()).split('/').pop() != 'boards' && publicDataRequest.data.validateUser === false)
                setURI(`${buildBaseUri()}/boards`);

            htmls('title', publicDataRequest.data.result.length != 1 ?
                renderLang({ es: `Boards - ${viewMetaData.host}`, en: `Boards - ${viewMetaData.host}` }) :
                renderLang({
                    es: `${formatUserName(publicDataRequest.data.result[0].username)} - Board`,
                    en: `${formatUserName(publicDataRequest.data.result[0].username)} - Board`
                }));
            htmls(idRender, /*html*/`
            ${await this.renderBoards(publicDataRequest.data.result, userNameUriValue, contentNameUriValue)}
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
    renderBoards: async function (dataBoards, userNameUriValue, contentNameUriValue) {

        let render = '';

        const generateRenderBoard = async (contentDataRender, dataBoard) => {
            
            const renderSingleContent = await GLOBAL.view_content.renderViewContent({
                ...contentDataRender,
                username: dataBoard.username,
                userNameUriValue,
                contentNameUriValue
            }, this.timeOutDelay);
            render += renderSingleContent;
        };

        for (let dataBoard of dataBoards) {
            for (let contentDataRender of dataBoard.markdown.concat(dataBoard.editor).concat(dataBoard['js-demo'])) {
                if (contentNameUriValue != undefined
                    &&
                    contentDataRender.title.replaceAll(' ', '-') == contentNameUriValue) {
                    await generateRenderBoard(contentDataRender, dataBoard);
                }
                else if (contentNameUriValue == undefined) {
                    await generateRenderBoard(contentDataRender, dataBoard);
                }
            }
        }
        return render;
    }
};