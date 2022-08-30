

this.view_content = {
    init: function (options) {
        return /*html*/``
    },
    routerDisplay: async function () {
        console.warn('init view content', GLOBAL['current-view-content']);
        if (GLOBAL['current-view-content'])
            if (localStorage.getItem('username')) htmls('view_content', await this.renderViewContent({
                ...GLOBAL['current-view-content'],
                username: localStorage.getItem('username')
            }));
    },
    renderViewContent: async (dataCurrentViewContent, timeOutDelay) => {

        const requestResult = await serviceRequest(() => `${buildBaseApiUri()}/uploads${dataCurrentViewContent.static}`, { raw: true });
        console.log('view content file', requestResult);
        if (GLOBAL[dataCurrentViewContent.component].renderView) {
            const idEdit = 'x' + s4();

            setTimeout(() => {
                if (s('.' + idEdit)) s('.' + idEdit).onclick = () => {
                    GLOBAL['current-edit-content'] = newInstance(dataCurrentViewContent);
                    GLOBAL['current-edit-content'].raw = requestResult;
                    GLOBAL.router(
                        {
                            newPath: viewPaths.find(x => x.component == GLOBAL['current-edit-content'].component).path
                        }
                    );
                };
            }, timeOutDelay);


            return /*html*/`

                <!--
                <pre>
                    ${JSON.stringify(dataCurrentViewContent, null, 4)}
                </pre>
                -->
            <div class='in container'>
                <div class='in' style='
                border: 4px solid purple;
                overflow: hidden;
                '>
                    <div class='in container title'>
                        ${dataCurrentViewContent.title}
                    </div>
                    <div class='in container'>
                        ${renderLang({ es: 'Por', en: 'By' })} ${renderUserLink(dataCurrentViewContent.username,
                GLOBAL['boards'] && GLOBAL['boards'].timeOutDelay ? GLOBAL['boards'].timeOutDelay : undefined)}, ${dataCurrentViewContent.date.replace('T', ' ').slice(0, -8)}
                    </div>
                    ${validateSession() &&
                    (
                        localStorage.getItem('username') == clearURI(getURI()).split('/').pop()
                        ||
                        'view-content' == clearURI(getURI()).split('/').pop()
                    ) ?/*html*/`
                    <div class='in container'>
                        <button class='${idEdit}'> ${renderLang({ es: 'Editar', en: 'Edit' })} </button>
                    </div>
                    `: ''}
                    <div class='in container'>
                        ${GLOBAL[dataCurrentViewContent.component].renderView(dataCurrentViewContent, requestResult, timeOutDelay)}
                    </div>
                </div>
            </div>
            `

        }

        return '';
    }
};