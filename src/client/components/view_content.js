

this.view_content = {
    init: function (options) {
        return /*html*/``
    },
    routerDisplay: () => {
        console.warn('init view content', GLOBAL['current-view-content']);
        if (GLOBAL['current-view-content']) {

            (async () => {

                const requestResult = await serviceRequest(() => `/uploads${GLOBAL['current-view-content'].static}`);
                console.log('view content file', requestResult);
                if (GLOBAL[GLOBAL['current-view-content'].component].renderView)
                    htmls('render-view-content',
                        /*html*/`
                        <div class='in container title'>
                            ${GLOBAL['current-view-content'].title}
                        </div>
                        <div class='in container'>
                            ${GLOBAL['current-view-content'].date.replace('T', ' ').slice(0, -8)}
                        </div>
                        <div class='in container'>
                            ${GLOBAL[GLOBAL['current-view-content'].component].renderView(GLOBAL['current-view-content'], requestResult)}
                        </div>                            
                        `
                    );

            })();

            htmls('view_content',  /*html*/`
            <div class='in container'>
                <pre>
                    ${JSON.stringify(GLOBAL['current-view-content'], null, 4)}
                </pre>
                <render-view-content></render-view-content>
            </div>
            `);
        }
    }
};