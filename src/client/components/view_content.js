

this.view_content = {
    init: function (options) {
        return /*html*/``
    },
    routerDisplay: () => {
        console.warn('init view content', GLOBAL['current-view-content']);
        if (GLOBAL['current-view-content']) {
            htmls('view_content',  /*html*/`
            <div class='in container'>
                <pre>
                    ${JSON.stringify(GLOBAL['current-view-content'], null, 4)}
                </pre>
            </div>
            `);
        }
    }
};